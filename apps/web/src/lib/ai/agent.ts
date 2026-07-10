import type { SupabaseClient } from '@supabase/supabase-js';
import type { AgentMessage, ModelToolSpec, ToolChatResult } from '@hr/ai';
import {
  executeTool,
  fromModelToolName,
  listToolsFor,
  toModelTools,
  type ToolContext,
} from '@/lib/tools';

/**
 * The Stellix agent — reactive mode. The model plans; every action passes
 * through executeTool, the same permission-checked path a button uses. The
 * agent operates as the signed-in human (commitment #2) and can never exceed
 * their permissions or the workspace trust ladder.
 */

export type ChatWithToolsFn = (
  messages: AgentMessage[],
  tools: ModelToolSpec[],
  options?: { maxTokens?: number },
) => Promise<ToolChatResult>;

export interface AgentActionSummary {
  tool: string;
  status: 'executed' | 'proposed' | 'refused';
  detail?: string;
}

export interface AgentResult {
  answer: string;
  actions: AgentActionSummary[];
}

const AGENT_GUARDRAILS = `You are Stellix, the AI agent inside a Tanzanian HR & payroll platform.
You act on behalf of the signed-in user, with exactly their permissions — never more.
Rules you must never break:
- FACTS COME ONLY FROM TOOLS. Numbers (pay, balances, headcounts, dates) must come from a tool result in this conversation. Never estimate, recalculate or invent a figure. The payroll engine computed every amount deterministically; your job is to narrate and explain.
- If a tool is refused or unavailable, say what you could not do and why. Do not work around it.
- Some actions are proposals: they wait for the human to confirm. Present proposals clearly; never claim they are done.
- Payroll approval and payment release always belong to humans. Never offer to do them.
- Answer in the language of the question (English or Swahili). Be concise and specific.`;

const MAX_TOOL_ROUNDS = 6;

export async function runAgent(
  supabase: SupabaseClient,
  chatWithTools: ChatWithToolsFn,
  input: {
    tenantId: string;
    userId: string;
    permissions: ReadonlySet<string>;
    model: string;
    question: string;
  },
): Promise<AgentResult> {
  const ctx: ToolContext = {
    supabase,
    tenantId: input.tenantId,
    userId: input.userId,
    principal: 'agent',
    permissions: input.permissions,
  };

  const available = listToolsFor(input.permissions, 'agent');
  const modelTools = toModelTools(available);
  const actions: AgentActionSummary[] = [];

  const messages: AgentMessage[] = [
    { role: 'system', content: AGENT_GUARDRAILS },
    { role: 'user', content: input.question },
  ];

  let answer = '';
  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    const response = await chatWithTools(messages, modelTools, { maxTokens: 1536 });

    if (response.toolCalls.length === 0) {
      answer = response.content;
      break;
    }

    messages.push({
      role: 'assistant',
      content: response.content || null,
      tool_calls: response.toolCalls,
    });

    for (const call of response.toolCalls) {
      const toolName = fromModelToolName(call.function.name);
      let parsed: Record<string, unknown> = {};
      try {
        parsed = call.function.arguments ? JSON.parse(call.function.arguments) : {};
      } catch {
        // fall through with empty input; the executor will refuse if invalid
      }

      const outcome = await executeTool(ctx, toolName, parsed);
      actions.push({
        tool: toolName,
        status: outcome.status,
        detail:
          outcome.status === 'proposed'
            ? outcome.summary
            : outcome.status === 'refused'
              ? outcome.reason
              : undefined,
      });

      messages.push({
        role: 'tool',
        tool_call_id: call.id,
        content: JSON.stringify(outcome),
      });
    }
  }

  if (!answer) {
    answer =
      'I could not finish within the allowed number of steps. Here is what I did: ' +
      actions.map((a) => `${a.tool} (${a.status})`).join(', ');
  }

  // Every agent conversation lands in the AI audit trail with its tool trace.
  await supabase.from('ai_audit').insert({
    tenant_id: input.tenantId,
    user_id: input.userId,
    assistant: 'agent',
    model: input.model,
    question: input.question,
    sources: actions.map((a) => ({ type: 'tool', ref: `${a.tool}:${a.status}` })),
    response: answer,
  });

  return { answer, actions };
}

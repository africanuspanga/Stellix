/**
 * Moonshot Kimi client (OpenAI-compatible chat completions API).
 *
 * Platform rule (blueprint §7, non-negotiable #3): AI explains HR and payroll
 * data — it never calculates payroll, approves anything, or releases payments.
 * Callers pass already-computed, permission-filtered data in the prompt
 * context; nothing here queries the database directly.
 */

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

// ── Tool calling (OpenAI-compatible) ─────────────────────────────────────
export interface ToolCall {
  id: string;
  type: 'function';
  function: { name: string; arguments: string };
}

export interface AssistantToolMessage {
  role: 'assistant';
  content: string | null;
  tool_calls?: ToolCall[];
}

export interface ToolResultMessage {
  role: 'tool';
  tool_call_id: string;
  content: string;
}

/** Message union for agent conversations (system/user/assistant/tool). */
export type AgentMessage = ChatMessage | AssistantToolMessage | ToolResultMessage;

export interface ModelToolSpec {
  type: 'function';
  function: { name: string; description: string; parameters: unknown };
}

export interface ToolChatResult {
  content: string;
  toolCalls: ToolCall[];
}

export interface KimiConfig {
  apiKey: string;
  baseUrl?: string;
  model?: string;
}

export interface ChatOptions {
  temperature?: number;
  maxTokens?: number;
  signal?: AbortSignal;
}

const DEFAULT_BASE_URL = 'https://api.moonshot.ai/v1';
const DEFAULT_MODEL = 'kimi-k2.6';

export function createKimiClient(config?: Partial<KimiConfig>) {
  const apiKey = config?.apiKey ?? process.env.MOONSHOT_API_KEY;
  const baseUrl = config?.baseUrl ?? process.env.MOONSHOT_BASE_URL ?? DEFAULT_BASE_URL;
  const model = config?.model ?? process.env.MOONSHOT_MODEL ?? DEFAULT_MODEL;

  if (!apiKey) {
    throw new Error('MOONSHOT_API_KEY is not set. Add it to apps/web/.env.local.');
  }

  async function chat(messages: ChatMessage[], options: ChatOptions = {}): Promise<string> {
    const res = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages,
        // kimi-k2.6 rejects any temperature other than its default — only
        // send the parameter when a caller explicitly sets it.
        ...(options.temperature !== undefined ? { temperature: options.temperature } : {}),
        max_tokens: options.maxTokens ?? 2048,
      }),
      signal: options.signal,
    });

    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(`Moonshot API error ${res.status}: ${body.slice(0, 500)}`);
    }

    const data = (await res.json()) as {
      choices: Array<{ message: { content: string } }>;
    };
    return data.choices[0]?.message?.content ?? '';
  }

  /** Chat completion that lets the model call registered tools. The caller
   *  executes each returned tool call (through the platform's permission-
   *  checked executor) and loops with the results appended. */
  async function chatWithTools(
    messages: AgentMessage[],
    tools: ModelToolSpec[],
    options: ChatOptions = {},
  ): Promise<ToolChatResult> {
    const res = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages,
        tools,
        ...(options.temperature !== undefined ? { temperature: options.temperature } : {}),
        max_tokens: options.maxTokens ?? 2048,
      }),
      signal: options.signal,
    });

    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(`Moonshot API error ${res.status}: ${body.slice(0, 500)}`);
    }

    const data = (await res.json()) as {
      choices: Array<{
        message: { content: string | null; tool_calls?: ToolCall[] };
      }>;
    };
    const message = data.choices[0]?.message;
    return {
      content: message?.content ?? '',
      toolCalls: message?.tool_calls ?? [],
    };
  }

  return { chat, chatWithTools, model };
}

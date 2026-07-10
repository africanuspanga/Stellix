import { logAudit } from '@/lib/audit';
import { emitEvent } from '@/lib/events/emit';
import { getTool, type ToolContext, type ToolDefinition } from './registry';

/**
 * The single choke point — every tool invocation, human or agent, passes
 * through here. There is no AI backdoor and no logic an agent cannot reach:
 * the button and the model call the same function, which does its own
 * permission check, records its own audit trail, and emits its own event.
 */

export type ToolExecution =
  | { status: 'executed'; result: unknown }
  | { status: 'proposed'; proposalId: string; summary: string }
  | { status: 'refused'; reason: string };

/** Autonomy level for this tool in this tenant (the trust ladder).
 *  No row ⇒ conservative defaults: reads/drafts allowed, writes propose. */
async function autonomyLevel(ctx: ToolContext, tool: ToolDefinition): Promise<number> {
  const { data } = await ctx.supabase
    .from('ai_autonomy_policies')
    .select('level')
    .eq('tenant_id', ctx.tenantId)
    .eq('tool_name', tool.name)
    .maybeSingle();
  if (data) return data.level as number;
  return tool.risk <= 1 ? 1 : 2; // default: read/draft freely, propose writes
}

async function recordAgentAction(
  ctx: ToolContext,
  tool: ToolDefinition,
  input: Record<string, unknown>,
  fields: {
    status: 'executed' | 'proposed' | 'failed';
    output?: unknown;
    error?: string;
  },
): Promise<string | null> {
  const { data } = await ctx.supabase
    .from('agent_actions')
    .insert({
      tenant_id: ctx.tenantId,
      on_behalf_of: ctx.userId,
      tool_name: tool.name,
      input,
      output: fields.output ?? null,
      risk_level: tool.risk,
      status: fields.status,
      error: fields.error ?? null,
      executed_at: fields.status === 'executed' ? new Date().toISOString() : null,
    })
    .select('id')
    .single();
  return (data?.id as string) ?? null;
}

export async function executeTool(
  ctx: ToolContext,
  name: string,
  input: Record<string, unknown>,
): Promise<ToolExecution> {
  const tool = getTool(name);
  if (!tool) return { status: 'refused', reason: `Unknown tool '${name}'.` };

  // One permission service for both user classes (commitment #2).
  if (!ctx.permissions.has(tool.permission)) {
    return {
      status: 'refused',
      reason: `Requires the '${tool.permission}' permission.`,
    };
  }

  if (ctx.principal === 'agent') {
    // The irreducible "always a human" list: structurally unreachable.
    if (tool.humanOnly) {
      return {
        status: 'refused',
        reason: `'${tool.name}' always requires a human (risk level ${tool.risk}).`,
      };
    }

    const level = await autonomyLevel(ctx, tool);
    if (level === 0) {
      return { status: 'refused', reason: `'${tool.name}' is disabled for AI in this workspace.` };
    }
    if (tool.risk >= 2 && level < 3) {
      if (level < 2) {
        return {
          status: 'refused',
          reason: `AI autonomy for '${tool.name}' is limited to read/draft in this workspace.`,
        };
      }
      // Trust ladder level 2: record a proposal; the human confirms, and the
      // confirmed action re-runs through this same choke point as a human.
      const proposalId = await recordAgentAction(ctx, tool, input, { status: 'proposed' });
      return {
        status: 'proposed',
        proposalId: proposalId ?? '',
        summary: `Proposed '${tool.name}' — awaiting your confirmation.`,
      };
    }
  }

  let result: unknown;
  try {
    result = await tool.handler(ctx, input);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Tool execution failed';
    if (ctx.principal === 'agent') {
      await recordAgentAction(ctx, tool, input, { status: 'failed', error: message });
      return { status: 'refused', reason: message };
    }
    throw err;
  }

  let agentActionId: string | null = null;
  if (ctx.principal === 'agent') {
    agentActionId = await recordAgentAction(ctx, tool, input, {
      status: 'executed',
      output: result,
    });
  }

  // Business writes land in the immutable audit trail and on the event spine.
  if (tool.risk >= 2) {
    await logAudit(ctx.supabase, {
      tenantId: ctx.tenantId,
      actorUserId: ctx.userId,
      action: tool.emits ?? `tool.${tool.name}`,
      entityType: 'tool_call',
      after: { tool: tool.name, input, principal: ctx.principal },
    });
  }
  if (tool.emits) {
    await emitEvent(ctx.supabase, {
      tenantId: ctx.tenantId,
      eventType: tool.emits,
      entityType: tool.name,
      actorUserId: ctx.userId,
      agentActionId,
      payload: { input },
    });
  }

  return { status: 'executed', result };
}

/** A human confirming their agent's proposal — the action re-executes through
 *  the same choke point under their own identity and permissions. */
export async function confirmProposal(
  ctx: ToolContext,
  proposalId: string,
): Promise<ToolExecution> {
  if (ctx.principal !== 'human') {
    return { status: 'refused', reason: 'Only a human can confirm a proposal.' };
  }
  const { data: proposal } = await ctx.supabase
    .from('agent_actions')
    .select('id, tool_name, input, status')
    .eq('id', proposalId)
    .eq('tenant_id', ctx.tenantId)
    .maybeSingle();
  if (!proposal || proposal.status !== 'proposed') {
    return { status: 'refused', reason: 'Proposal not found or already decided.' };
  }

  const outcome = await executeTool(
    ctx,
    proposal.tool_name as string,
    (proposal.input ?? {}) as Record<string, unknown>,
  );

  await ctx.supabase
    .from('agent_actions')
    .update({
      status: outcome.status === 'executed' ? 'approved' : 'rejected',
      output: outcome.status === 'executed' ? outcome.result : null,
      error: outcome.status === 'refused' ? outcome.reason : null,
      approved_by: ctx.userId,
      approved_at: new Date().toISOString(),
      executed_at: outcome.status === 'executed' ? new Date().toISOString() : null,
    })
    .eq('id', proposalId);

  return outcome;
}

export async function rejectProposal(ctx: ToolContext, proposalId: string): Promise<void> {
  await ctx.supabase
    .from('agent_actions')
    .update({
      status: 'rejected',
      approved_by: ctx.userId,
      approved_at: new Date().toISOString(),
    })
    .eq('id', proposalId)
    .eq('tenant_id', ctx.tenantId)
    .eq('status', 'proposed');
}

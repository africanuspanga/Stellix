import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * The tool registry — commitment #1 of the AI-native architecture
 * (docs/AI-NATIVE.md): every business operation is a discrete, named,
 * described service with typed inputs, a permission requirement and a risk
 * level. Humans reach it through a button; agents reach it through a tool
 * call. One code path, one permission check, one audit trail.
 */

/** Who is invoking the tool. Agents always act ON BEHALF OF a human. */
export type Principal = 'human' | 'agent';

/**
 * Risk levels (the trust ladder, blueprint §7 "AI levels"):
 *   0 — read-only: query and explain
 *   1 — draft: produces content for a human to use (nothing changes)
 *   2 — controlled write: reversible business writes (leave request, desk ticket)
 *   3 — money / irreversible: payroll approval, payments, terminations
 */
export type RiskLevel = 0 | 1 | 2 | 3;

export interface ToolContext {
  supabase: SupabaseClient; // caller's RLS session — never service-role
  tenantId: string;
  userId: string; // the human principal (agents inherit this identity)
  principal: Principal;
  permissions: ReadonlySet<string>;
}

/** JSON-Schema fragment sent to the model; validated again server-side. */
export interface ToolParameters {
  type: 'object';
  properties: Record<
    string,
    { type: string; description: string; enum?: string[] }
  >;
  required?: string[];
}

export interface ToolDefinition {
  /** Namespaced name, e.g. 'people.find_employee'. */
  name: string;
  /** Shown to both the model and the autonomy-settings UI. */
  description: string;
  /** Permission key checked for BOTH user classes — same service as buttons. */
  permission: string;
  risk: RiskLevel;
  /** Structurally unreachable for agents regardless of autonomy level.
   *  Anything that moves money or ends employment is humanOnly. */
  humanOnly?: boolean;
  /** Domain event emitted after a successful execution, e.g. 'leave.requested'. */
  emits?: string;
  parameters: ToolParameters;
  handler: (ctx: ToolContext, input: Record<string, unknown>) => Promise<unknown>;
}

const registry = new Map<string, ToolDefinition>();

export function registerTool(tool: ToolDefinition): void {
  if (registry.has(tool.name)) {
    throw new Error(`Tool '${tool.name}' is already registered`);
  }
  if (tool.risk === 3 && !tool.humanOnly) {
    throw new Error(
      `Tool '${tool.name}' is risk 3 (money/irreversible) and must be humanOnly`,
    );
  }
  registry.set(tool.name, tool);
}

export function getTool(name: string): ToolDefinition | undefined {
  return registry.get(name);
}

export function listTools(): ToolDefinition[] {
  return [...registry.values()];
}

/** Tools this principal could invoke — permission-filtered, and for agents,
 *  humanOnly tools are simply not in the list the model ever sees. */
export function listToolsFor(
  permissions: ReadonlySet<string>,
  principal: Principal,
): ToolDefinition[] {
  return listTools().filter(
    (t) =>
      permissions.has(t.permission) && (principal === 'human' || !t.humanOnly),
  );
}

/** OpenAI-compatible tool specs (Moonshot Kimi tool calling). */
export function toModelTools(tools: ToolDefinition[]): Array<{
  type: 'function';
  function: { name: string; description: string; parameters: ToolParameters };
}> {
  return tools.map((t) => ({
    type: 'function',
    function: {
      // OpenAI tool names must match [a-zA-Z0-9_-]; dots are namespaced with __
      name: t.name.replace(/\./g, '__'),
      description: t.description,
      parameters: t.parameters,
    },
  }));
}

export function fromModelToolName(modelName: string): string {
  return modelName.replace(/__/g, '.');
}

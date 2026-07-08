import type { SupabaseClient } from '@supabase/supabase-js';
import type { ChatMessage } from '@hr/ai';

// AI assistants (blueprint §7): they EXPLAIN data the platform already
// computed — they never calculate payroll, approve anything, or write HR
// records. Retrieval respects the caller's RLS; every interaction lands in
// ai_audit with its sources.

export type ChatFn = (messages: ChatMessage[], options?: { maxTokens?: number }) => Promise<string>;

export interface AssistantResult {
  answer: string;
  sources: Array<{ type: string; ref: string }>;
}

const GUARDRAILS = `You are Stellix, the HR assistant for a Tanzanian workforce platform.
Rules you must never break:
- Answer ONLY from the context provided. If the context does not contain the answer, say so and direct the person to HR — never guess or invent policy or numbers.
- Never recalculate, adjust or dispute amounts: the payroll engine already computed them deterministically. Your job is to explain them.
- Answer in the same language as the question (English or Swahili).
- Be concise and warm. Cite policy titles or rule names/versions when you rely on them.`;

async function logInteraction(
  supabase: SupabaseClient,
  input: {
    tenantId: string;
    userId: string;
    assistant: 'policy_qa' | 'payslip_explainer' | 'anomaly_summary';
    model: string;
    question: string;
    sources: Array<{ type: string; ref: string }>;
    response: string;
  },
): Promise<void> {
  await supabase.from('ai_audit').insert({
    tenant_id: input.tenantId,
    user_id: input.userId,
    assistant: input.assistant,
    model: input.model,
    question: input.question,
    sources: input.sources,
    response: input.response,
  });
}

// ── Policy Q&A ───────────────────────────────────────────────────────────
export async function policyQA(
  supabase: SupabaseClient,
  chat: ChatFn,
  input: { tenantId: string; userId: string; model: string; question: string },
): Promise<AssistantResult> {
  const { data: policies } = await supabase
    .from('company_policies')
    .select('title, category, body')
    .eq('is_active', true)
    .order('category');

  if (!policies || policies.length === 0) {
    return {
      answer:
        'No company policies have been published yet, so I cannot answer policy questions. Please contact HR directly.',
      sources: [],
    };
  }

  let budget = 12_000;
  const included: typeof policies = [];
  for (const policy of policies) {
    const cost = policy.title.length + policy.body.length;
    if (budget - cost < 0) break;
    budget -= cost;
    included.push(policy);
  }

  const context = included
    .map((p) => `## ${p.title} [${p.category}]\n${p.body}`)
    .join('\n\n');
  const answer = await chat([
    { role: 'system', content: `${GUARDRAILS}\n\nCompany policies:\n${context}` },
    { role: 'user', content: input.question },
  ]);

  const sources = included.map((p) => ({ type: 'policy', ref: p.title }));
  await logInteraction(supabase, { ...input, assistant: 'policy_qa', sources, response: answer });
  return { answer, sources };
}

// ── Payslip explanation ──────────────────────────────────────────────────
interface TraceLine {
  step: string;
  detail: string;
  amount: number;
  rule?: { name: string; version: number; status: string; legalSource: string | null };
}

export async function explainPayslip(
  supabase: SupabaseClient,
  chat: ChatFn,
  input: {
    tenantId: string;
    userId: string;
    model: string;
    runId: string;
    employeeId: string;
    question: string;
  },
): Promise<AssistantResult> {
  // RLS decides access: employees resolve only their own line.
  const { data: line } = await supabase
    .from('payroll_run_lines')
    .select('*')
    .eq('run_id', input.runId)
    .eq('employee_id', input.employeeId)
    .maybeSingle();
  if (!line) {
    return { answer: 'That payslip was not found (or you do not have access to it).', sources: [] };
  }

  const { data: runMeta } = await supabase
    .from('payslip_run_meta')
    .select('period_year, period_month')
    .eq('id', input.runId)
    .maybeSingle();

  // Previous period line for "why did it change" questions.
  let previous: Record<string, unknown> | null = null;
  if (runMeta) {
    const prevMonth = runMeta.period_month === 1 ? 12 : runMeta.period_month - 1;
    const prevYear = runMeta.period_month === 1 ? runMeta.period_year - 1 : runMeta.period_year;
    const { data: prevMetaRows } = await supabase
      .from('payslip_run_meta')
      .select('id')
      .eq('period_year', prevYear)
      .eq('period_month', prevMonth);
    const prevIds = (prevMetaRows ?? []).map((r) => r.id as string);
    if (prevIds.length > 0) {
      const { data: prevLine } = await supabase
        .from('payroll_run_lines')
        .select('gross_pay, paye, net_pay, total_deductions')
        .in('run_id', prevIds)
        .eq('employee_id', input.employeeId)
        .maybeSingle();
      previous = prevLine;
    }
  }

  const trace = ((line.trace as TraceLine[]) ?? [])
    .map((t) => {
      const rule = t.rule ? ` [rule: ${t.rule.name} v${t.rule.version}, ${t.rule.status}]` : '';
      return `- ${t.step}: ${t.detail} = ${t.amount}${rule}`;
    })
    .join('\n');

  const period = runMeta ? `${runMeta.period_year}-${String(runMeta.period_month).padStart(2, '0')}` : 'unknown';
  const context = `Payslip for ${line.employee_name} (${line.employee_number}), period ${period}. All amounts in TZS.
Summary: basic ${line.basic_salary}, gross ${line.gross_pay}, taxable ${line.taxable_income}, PAYE ${line.paye}, total deductions ${line.total_deductions}, NET PAY ${line.net_pay}.
Calculation trace (computed deterministically by the payroll engine):
${trace}
${previous ? `Previous period: gross ${previous.gross_pay}, PAYE ${previous.paye}, net ${previous.net_pay}, deductions ${previous.total_deductions}.` : 'No previous period data available.'}`;

  const answer = await chat([
    { role: 'system', content: `${GUARDRAILS}\n\n${context}` },
    { role: 'user', content: input.question },
  ]);

  const sources = [
    { type: 'payroll_run_line', ref: `${input.runId}/${input.employeeId}` },
    ...(previous ? [{ type: 'previous_period_line', ref: period }] : []),
  ];
  await logInteraction(supabase, {
    tenantId: input.tenantId, userId: input.userId, model: input.model,
    question: input.question, assistant: 'payslip_explainer', sources, response: answer,
  });
  return { answer, sources };
}

// ── Anomaly summary (payroll reviewers) ──────────────────────────────────
export async function summarizeRunAnomalies(
  supabase: SupabaseClient,
  chat: ChatFn,
  input: { tenantId: string; userId: string; model: string; runId: string },
): Promise<AssistantResult> {
  // RLS: only payroll staff can read runs at all.
  const { data: run } = await supabase
    .from('payroll_runs')
    .select('period_year, period_month, status, totals, variances')
    .eq('id', input.runId)
    .maybeSingle();
  if (!run) {
    return { answer: 'Run not found (or you do not have payroll access).', sources: [] };
  }

  const variances = (run.variances as Array<Record<string, unknown>> | null) ?? [];
  const context = `Payroll run ${run.period_year}-${String(run.period_month).padStart(2, '0')} (status: ${run.status}).
Totals: ${JSON.stringify(run.totals)}.
Variance findings from the deterministic variance engine (${variances.length}):
${variances.map((v) => `- [${v.type}] ${v.employeeName}: ${v.detail} (amount ${v.amount})`).join('\n') || '- none'}`;

  const answer = await chat([
    {
      role: 'system',
      content: `${GUARDRAILS}\n\nYou are preparing payroll review notes for a payroll officer. Group the findings, highlight what needs human attention first (negative/zero net, missing employees, minimum-wage issues), and state clearly which findings look routine. Do not invent findings not listed.\n\n${context}`,
    },
    { role: 'user', content: 'Summarize this run for review and tell me what to check before approval.' },
  ]);

  const sources = [{ type: 'payroll_run', ref: input.runId }];
  await logInteraction(supabase, {
    tenantId: input.tenantId, userId: input.userId, model: input.model,
    question: 'anomaly summary', assistant: 'anomaly_summary', sources, response: answer,
  });
  return { answer, sources };
}

import { registerTool } from './registry';

/**
 * First-class tools — the operations both user classes share. Facts come only
 * from these structured queries; the model narrates them, it never generates
 * numbers (docs/AI-NATIVE.md, facts-vs-knowledge rule).
 *
 * Registration is module-side-effect based; import '@/lib/tools' to load.
 */

// ── People (risk 0: read) ────────────────────────────────────────────────

registerTool({
  name: 'people.find_employee',
  description:
    'Search employees by name or employee number. Returns id, name, number and status for up to 10 matches.',
  permission: 'people.employee.read',
  risk: 0,
  parameters: {
    type: 'object',
    properties: {
      query: { type: 'string', description: 'Name fragment or employee number' },
    },
    required: ['query'],
  },
  handler: async (ctx, input) => {
    // Strip PostgREST filter metacharacters so a crafted query can't restructure
    // the OR group (commas/parens) — tenant scope is AND-ed so it can't escape
    // the tenant, but this prevents broadened matches and parse errors.
    const q = String(input.query ?? '').replace(/[,()*\\]/g, ' ').trim();
    if (!q) return { matches: [] };
    const { data } = await ctx.supabase
      .from('employees')
      .select('id, first_name, last_name, employee_number, status')
      .eq('tenant_id', ctx.tenantId)
      .or(
        `first_name.ilike.%${q}%,last_name.ilike.%${q}%,employee_number.ilike.%${q}%`,
      )
      .limit(10);
    return {
      matches: (data ?? []).map((e) => ({
        id: e.id,
        name: `${e.first_name} ${e.last_name}`,
        employeeNumber: e.employee_number,
        status: e.status,
      })),
    };
  },
});

registerTool({
  name: 'people.headcount_summary',
  description:
    'Current headcount broken down by employment status (onboarding, probation, active, suspended, on_leave, exiting, exited).',
  permission: 'people.employee.read',
  risk: 0,
  parameters: { type: 'object', properties: {} },
  handler: async (ctx) => {
    const { data } = await ctx.supabase
      .from('employees')
      .select('status')
      .eq('tenant_id', ctx.tenantId);
    const byStatus: Record<string, number> = {};
    for (const row of data ?? []) {
      byStatus[row.status as string] = (byStatus[row.status as string] ?? 0) + 1;
    }
    const active = ['onboarding', 'probation', 'active', 'suspended', 'on_leave'];
    return {
      total: (data ?? []).length,
      activeHeadcount: (data ?? []).filter((r) => active.includes(r.status as string)).length,
      byStatus,
    };
  },
});

// ── Leave ────────────────────────────────────────────────────────────────

registerTool({
  name: 'leave.check_balance',
  description:
    'Leave-ledger balance per leave type for one employee (sum of credits minus debits).',
  permission: 'time.leave.request',
  risk: 0,
  parameters: {
    type: 'object',
    properties: {
      employee_id: {
        type: 'string',
        description: 'Employee id (from people.find_employee). Omit for the requesting user.',
      },
    },
  },
  handler: async (ctx, input) => {
    const { data: me } = await ctx.supabase
      .from('employees')
      .select('id')
      .eq('tenant_id', ctx.tenantId)
      .eq('user_id', ctx.userId)
      .maybeSingle();
    const ownId = (me?.id as string) ?? null;

    const employeeId = input.employee_id ? String(input.employee_id) : ownId;
    // Reading someone else's balance requires the approver permission.
    if (employeeId !== ownId && !ctx.permissions.has('time.leave.approve')) {
      return { error: 'You can only check your own leave balance.' };
    }
    if (!employeeId) return { error: 'No employee record found for this user.' };

    const [{ data: entries }, { data: types }] = await Promise.all([
      ctx.supabase
        .from('leave_ledger')
        .select('leave_type_id, days')
        .eq('employee_id', employeeId),
      ctx.supabase
        .from('leave_types')
        .select('id, name')
        .eq('tenant_id', ctx.tenantId),
    ]);
    const nameOf = new Map((types ?? []).map((t) => [t.id as string, t.name as string]));
    const balances: Record<string, number> = {};
    for (const entry of entries ?? []) {
      const key = nameOf.get(entry.leave_type_id as string) ?? 'Unknown';
      balances[key] = Math.round(((balances[key] ?? 0) + Number(entry.days)) * 10) / 10;
    }
    return { employeeId, balances };
  },
});

registerTool({
  name: 'leave.pending_requests',
  description: 'Leave requests currently awaiting approval, oldest first.',
  permission: 'time.leave.approve',
  risk: 0,
  parameters: { type: 'object', properties: {} },
  handler: async (ctx) => {
    const { data } = await ctx.supabase
      .from('leave_requests')
      .select('id, employee_id, start_date, end_date, days, status, created_at, employees(first_name, last_name)')
      .eq('tenant_id', ctx.tenantId)
      .eq('status', 'pending')
      .order('created_at')
      .limit(20);
    return {
      pending: (data ?? []).map((r) => {
        const emp = r.employees as
          | { first_name?: string; last_name?: string }
          | { first_name?: string; last_name?: string }[]
          | null;
        const e = Array.isArray(emp) ? emp[0] : emp;
        return {
          id: r.id,
          employee: `${e?.first_name ?? ''} ${e?.last_name ?? ''}`.trim(),
          startDate: r.start_date,
          endDate: r.end_date,
          days: r.days,
        };
      }),
    };
  },
});

// ── Payroll (risk 0: read + explain — the engine computed, AI narrates) ──

registerTool({
  name: 'payroll.run_summary',
  description:
    'Most recent payroll runs with period, status and totals (gross, PAYE, net, employer cost, employee count). Numbers come from the deterministic engine.',
  permission: 'payroll.run.read',
  risk: 0,
  parameters: { type: 'object', properties: {} },
  handler: async (ctx) => {
    const { data } = await ctx.supabase
      .from('payroll_runs')
      .select('id, period_year, period_month, run_type, status, totals')
      .eq('tenant_id', ctx.tenantId)
      .order('period_year', { ascending: false })
      .order('period_month', { ascending: false })
      .limit(6);
    return { runs: data ?? [] };
  },
});

registerTool({
  name: 'payroll.explain_payslip',
  description:
    'Full calculated payslip for one employee in one run: gross, taxable income, PAYE, pension, deductions, net pay and the engine trace. Use these exact figures — never recalculate.',
  permission: 'payroll.run.read',
  risk: 0,
  parameters: {
    type: 'object',
    properties: {
      run_id: { type: 'string', description: 'Payroll run id (from payroll.run_summary)' },
      employee_id: { type: 'string', description: 'Employee id (from people.find_employee)' },
    },
    required: ['run_id', 'employee_id'],
  },
  handler: async (ctx, input) => {
    const { data } = await ctx.supabase
      .from('payroll_run_lines')
      .select(
        'employee_name, employee_number, basic_salary, gross_pay, taxable_income, paye, pension_employee, total_deductions, net_pay, employer_cost, earnings, statutory_deductions, other_deductions, trace, warnings',
      )
      .eq('run_id', String(input.run_id ?? ''))
      .eq('employee_id', String(input.employee_id ?? ''))
      .maybeSingle();
    if (!data) return { error: 'No payslip line found for that run and employee.' };
    return data;
  },
});

// ── Service desk (risk 2: controlled write → trust ladder applies) ───────

registerTool({
  name: 'desk.raise_request',
  description:
    'Raise an HR service-desk request on behalf of the current user (payslip issue, leave dispute, bank change, letter request, contract question, benefit enquiry, complaint, other).',
  permission: 'experience.desk.request',
  risk: 2,
  emits: 'desk.request.raised',
  parameters: {
    type: 'object',
    properties: {
      category: {
        type: 'string',
        description: 'Request category',
        enum: [
          'payslip_issue', 'leave_dispute', 'bank_change', 'letter_request',
          'contract_question', 'benefit_enquiry', 'complaint', 'other',
        ],
      },
      subject: { type: 'string', description: 'One-line subject' },
      description: { type: 'string', description: 'Details of the request' },
    },
    required: ['category', 'subject'],
  },
  handler: async (ctx, input) => {
    const { data: me } = await ctx.supabase
      .from('employees')
      .select('id')
      .eq('user_id', ctx.userId)
      .maybeSingle();
    const { data, error } = await ctx.supabase
      .from('service_requests')
      .insert({
        tenant_id: ctx.tenantId,
        employee_id: (me?.id as string) ?? null,
        opened_by: ctx.userId,
        category: String(input.category ?? 'other'),
        subject: String(input.subject ?? '').slice(0, 200),
        description: input.description ? String(input.description) : null,
      })
      .select('id, category, subject, status')
      .single();
    if (error) throw new Error(`Service request failed: ${error.message}`);
    return data;
  },
});

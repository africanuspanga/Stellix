import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';

// Server-side reads for the People module. RLS scopes everything to the
// caller's tenants; current rows are the effective-dated records with
// effective_to IS NULL.

export interface EmployeeListRow {
  id: string;
  employee_number: string;
  first_name: string;
  middle_name: string | null;
  last_name: string;
  status: string;
  employment_type: string;
  hire_date: string;
  work_email: string | null;
  phone: string | null;
}

export function fullName(e: { first_name: string; middle_name?: string | null; last_name: string }) {
  return [e.first_name, e.middle_name, e.last_name].filter(Boolean).join(' ');
}

export async function getEmployees(supabase: SupabaseClient) {
  const { data } = await supabase
    .from('employees')
    .select('id, employee_number, first_name, middle_name, last_name, status, employment_type, hire_date, work_email, phone')
    .order('employee_number');
  return (data ?? []) as EmployeeListRow[];
}

/** Current assignments for a set of employees, with joined display names. */
export async function getCurrentAssignments(supabase: SupabaseClient, employeeIds?: string[]) {
  let query = supabase
    .from('employee_assignments')
    .select(
      'id, employee_id, effective_from, position_id, department_id, branch_id, cost_centre_id, manager_employee_id, positions(title, code), departments(name), branches(name)',
    )
    .is('effective_to', null);
  if (employeeIds && employeeIds.length > 0) query = query.in('employee_id', employeeIds);
  const { data } = await query;
  return data ?? [];
}

export async function getEmployee(supabase: SupabaseClient, id: string) {
  const { data } = await supabase
    .from('employees')
    .select('*')
    .eq('id', id)
    .maybeSingle();
  return data;
}

export async function getEmployeeDetail(supabase: SupabaseClient, employeeId: string) {
  const [assignments, compensation, contracts, banks, dependants, documents, actions] =
    await Promise.all([
      supabase
        .from('employee_assignments')
        .select(
          'id, effective_from, effective_to, positions(title, code), departments(name), branches(name), manager:employees!employee_assignments_manager_employee_id_fkey(first_name, last_name)',
        )
        .eq('employee_id', employeeId)
        .order('effective_from', { ascending: false }),
      supabase
        .from('employee_compensation')
        .select('id, basic_salary, currency, pay_frequency, effective_from, effective_to')
        .eq('employee_id', employeeId)
        .order('effective_from', { ascending: false }),
      supabase
        .from('employee_contracts')
        .select('*')
        .eq('employee_id', employeeId)
        .order('starts_on', { ascending: false }),
      supabase
        .from('employee_bank_accounts')
        .select('*')
        .eq('employee_id', employeeId)
        .order('is_primary', { ascending: false }),
      supabase
        .from('employee_dependants')
        .select('*')
        .eq('employee_id', employeeId)
        .order('full_name'),
      supabase
        .from('employee_documents')
        .select('*')
        .eq('employee_id', employeeId)
        .order('created_at', { ascending: false }),
      supabase
        .from('employment_actions')
        .select('*')
        .eq('employee_id', employeeId)
        .order('effective_date', { ascending: false }),
    ]);

  return {
    assignments: assignments.data ?? [],
    compensation: compensation.data ?? [],
    contracts: contracts.data ?? [],
    banks: banks.data ?? [],
    dependants: dependants.data ?? [],
    documents: documents.data ?? [],
    actions: actions.data ?? [],
  };
}

/** Days until a date; negative = past. */
export function daysUntil(date: string | null): number | null {
  if (!date) return null;
  const target = new Date(`${date}T00:00:00Z`).getTime();
  return Math.round((target - Date.now()) / 86_400_000);
}

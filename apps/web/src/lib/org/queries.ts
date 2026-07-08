import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';

// Server-side reads for the organization section. All queries run through the
// user's RLS-scoped client; tenant filtering is enforced by policy.

export interface LegalEntityRow {
  id: string;
  name: string;
  jurisdiction: string;
  sector: string;
}

export async function getLegalEntities(supabase: SupabaseClient) {
  const { data } = await supabase
    .from('legal_entities')
    .select('id, name, jurisdiction, sector')
    .order('name');
  return (data ?? []) as LegalEntityRow[];
}

export async function getBranches(supabase: SupabaseClient) {
  const { data } = await supabase
    .from('branches')
    .select('id, name, code, region, address, is_active, legal_entity_id, legal_entities(name)')
    .order('name');
  return data ?? [];
}

export async function getDepartments(supabase: SupabaseClient) {
  const { data } = await supabase
    .from('departments')
    .select('id, name, code, is_active, legal_entity_id, parent_department_id')
    .order('name');
  return data ?? [];
}

export async function getCostCentres(supabase: SupabaseClient) {
  const { data } = await supabase
    .from('cost_centres')
    .select('id, name, code, is_active, legal_entity_id')
    .order('code');
  return data ?? [];
}

export async function getJobFamilies(supabase: SupabaseClient) {
  const { data } = await supabase
    .from('job_families')
    .select('id, name, description')
    .order('name');
  return data ?? [];
}

export async function getJobGrades(supabase: SupabaseClient) {
  const { data } = await supabase
    .from('job_grades')
    .select('id, name, level, band_min, band_max, currency, job_family_id, job_families(name)')
    .order('level', { ascending: true, nullsFirst: false });
  return data ?? [];
}

export interface PositionRow {
  id: string;
  code: string;
  title: string;
  status: string;
  is_budgeted: boolean;
  headcount: number;
  budgeted_annual_cost: number | null;
  legal_entity_id: string;
  department_id: string | null;
  branch_id: string | null;
  job_grade_id: string | null;
  reports_to_position_id: string | null;
  departments: { name: string } | null;
  branches: { name: string } | null;
  job_grades: { name: string } | null;
}

export async function getPositions(supabase: SupabaseClient) {
  const { data } = await supabase
    .from('positions')
    .select(
      'id, code, title, status, is_budgeted, headcount, budgeted_annual_cost, legal_entity_id, department_id, branch_id, job_grade_id, reports_to_position_id, departments(name), branches(name), job_grades(name)',
    )
    .order('code');
  return (data ?? []) as unknown as PositionRow[];
}

export function formatMoney(amount: number | null, currency = 'TZS'): string {
  if (amount === null || amount === undefined) return '—';
  return new Intl.NumberFormat('en-TZ', {
    style: 'currency',
    currency,
    maximumFractionDigits: 0,
  }).format(amount);
}

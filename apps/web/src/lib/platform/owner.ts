import 'server-only';
import { createClient } from '@/lib/supabase/server';

/**
 * Platform-owner (SaaS operator) data access. Every function runs through the
 * caller's RLS session and the SECURITY DEFINER functions from migration 0020,
 * which self-check app.is_platform_owner() and return only aggregates — never
 * an individual customer's PII.
 */

export interface PlatformSummary {
  tenants: number;
  activeTenants: number;
  trialTenants: number;
  employees: number;
  users: number;
  newTenants30d: number;
  payrollNetThisMonth: number;
  aiInteractions30d: number;
  agentActions30d: number;
}

export interface TenantStat {
  tenantId: string;
  name: string;
  slug: string;
  plan: string;
  status: string;
  createdAt: string;
  employeeCount: number;
  userCount: number;
  payrollNetThisMonth: number;
}

export async function isPlatformOwner(): Promise<boolean> {
  const supabase = await createClient();
  const { data } = await supabase.rpc('is_platform_owner');
  return data === true;
}

export async function getPlatformSummary(): Promise<PlatformSummary | null> {
  const supabase = await createClient();
  const { data } = await supabase.rpc('platform_summary');
  if (!data) return null;
  const d = data as Record<string, number>;
  return {
    tenants: d.tenants ?? 0,
    activeTenants: d.active_tenants ?? 0,
    trialTenants: d.trial_tenants ?? 0,
    employees: d.employees ?? 0,
    users: d.users ?? 0,
    newTenants30d: d.new_tenants_30d ?? 0,
    payrollNetThisMonth: Number(d.payroll_net_this_month ?? 0),
    aiInteractions30d: d.ai_interactions_30d ?? 0,
    agentActions30d: d.agent_actions_30d ?? 0,
  };
}

export async function getTenantStats(): Promise<TenantStat[]> {
  const supabase = await createClient();
  const { data } = await supabase.rpc('platform_tenant_stats');
  return ((data ?? []) as Array<Record<string, unknown>>).map((r) => ({
    tenantId: r.tenant_id as string,
    name: r.name as string,
    slug: r.slug as string,
    plan: r.plan as string,
    status: r.status as string,
    createdAt: r.created_at as string,
    employeeCount: Number(r.employee_count ?? 0),
    userCount: Number(r.user_count ?? 0),
    payrollNetThisMonth: Number(r.payroll_net_this_month ?? 0),
  }));
}

import 'server-only';
import { createClient } from '@/lib/supabase/server';

export interface DashboardMetrics {
  headcount: number;
  probation: number;
  onLeave: number;
  pendingActions: number;
  pendingLeave: number;
  contractsExpiring: number;
  openPositions: number;
}

export interface ActivityEntry {
  action: string;
  entityType: string;
  createdAt: string;
}

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/**
 * Tenant-scoped headline metrics for the overview. All reads run through the
 * caller's RLS session and are filtered to the active tenant, so a partner
 * user only sees the company they have switched into. head+count queries —
 * no row payloads — so this stays cheap at scale.
 */
export async function getDashboardMetrics(tenantId: string): Promise<DashboardMetrics> {
  const supabase = await createClient();
  const today = new Date();
  const horizon = new Date(today.getTime() + 60 * 24 * 60 * 60 * 1000);

  const employeeCount = (statuses: string[]) =>
    supabase
      .from('employees')
      .select('id', { count: 'exact', head: true })
      .eq('tenant_id', tenantId)
      .in('status', statuses);

  const [headcount, probation, onLeave, pendingActions, pendingLeave, contractsExpiring, openPositions] =
    await Promise.all([
      employeeCount(['onboarding', 'probation', 'active', 'suspended', 'on_leave']),
      employeeCount(['probation']),
      employeeCount(['on_leave']),
      supabase
        .from('employment_actions')
        .select('id', { count: 'exact', head: true })
        .eq('tenant_id', tenantId)
        .eq('status', 'pending_approval'),
      supabase
        .from('leave_requests')
        .select('id', { count: 'exact', head: true })
        .eq('tenant_id', tenantId)
        .eq('status', 'pending'),
      supabase
        .from('employee_contracts')
        .select('id', { count: 'exact', head: true })
        .eq('tenant_id', tenantId)
        .not('ends_on', 'is', null)
        .gte('ends_on', isoDate(today))
        .lte('ends_on', isoDate(horizon)),
      supabase
        .from('positions')
        .select('id', { count: 'exact', head: true })
        .eq('tenant_id', tenantId)
        .in('status', ['vacant', 'budgeted']),
    ]);

  return {
    headcount: headcount.count ?? 0,
    probation: probation.count ?? 0,
    onLeave: onLeave.count ?? 0,
    pendingActions: pendingActions.count ?? 0,
    pendingLeave: pendingLeave.count ?? 0,
    contractsExpiring: contractsExpiring.count ?? 0,
    openPositions: openPositions.count ?? 0,
  };
}

/** Latest audit-trail entries for the activity feed (RLS member-read). */
export async function getRecentActivity(tenantId: string): Promise<ActivityEntry[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from('audit_logs')
    .select('action, entity_type, created_at')
    .eq('tenant_id', tenantId)
    .order('created_at', { ascending: false })
    .limit(8);
  return (data ?? []).map((row) => ({
    action: row.action as string,
    entityType: row.entity_type as string,
    createdAt: row.created_at as string,
  }));
}

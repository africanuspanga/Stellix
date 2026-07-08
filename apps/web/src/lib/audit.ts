import type { SupabaseClient } from '@supabase/supabase-js';

export interface AuditEntry {
  tenantId: string;
  actorUserId?: string | null;
  action: string; // e.g. 'tenant.created', 'employee.updated'
  entityType: string;
  entityId?: string | null;
  before?: unknown;
  after?: unknown;
  reason?: string;
}

/**
 * Append to the immutable audit trail (non-negotiable #6). Failures are
 * surfaced — a write whose audit entry cannot be recorded should not be
 * treated as successful.
 */
export async function logAudit(supabase: SupabaseClient, entry: AuditEntry): Promise<void> {
  const { error } = await supabase.from('audit_logs').insert({
    tenant_id: entry.tenantId,
    actor_user_id: entry.actorUserId ?? null,
    action: entry.action,
    entity_type: entry.entityType,
    entity_id: entry.entityId ?? null,
    before_data: entry.before ?? null,
    after_data: entry.after ?? null,
    reason: entry.reason ?? null,
  });
  if (error) {
    throw new Error(`Audit log write failed for ${entry.action}: ${error.message}`);
  }
}

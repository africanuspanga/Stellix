import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * The event spine — commitment #3 of the AI-native architecture. Every
 * meaningful change publishes a fact ('leave.requested', 'employee.hired',
 * 'payroll.run.approved') that ambient agents subscribe to. Emission is
 * best-effort by design: a failed event insert must never roll back the
 * business write it describes — the audit log remains the source of truth.
 */
export interface DomainEvent {
  tenantId: string;
  eventType: string; // dot-namespaced fact, past tense: 'leave.requested'
  entityType: string;
  entityId?: string | null;
  actorUserId?: string | null;
  agentActionId?: string | null;
  payload?: Record<string, unknown>;
}

export async function emitEvent(
  supabase: SupabaseClient,
  event: DomainEvent,
): Promise<void> {
  const { error } = await supabase.from('domain_events').insert({
    tenant_id: event.tenantId,
    event_type: event.eventType,
    entity_type: event.entityType,
    entity_id: event.entityId ?? null,
    actor_user_id: event.actorUserId ?? null,
    agent_action_id: event.agentActionId ?? null,
    payload: event.payload ?? {},
  });
  if (error) {
    // Deliberately non-fatal (see above) — but never silent.
    console.error(`domain_events emit failed for ${event.eventType}: ${error.message}`);
  }
}

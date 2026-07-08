'use server';

import { revalidatePath } from 'next/cache';
import { requirePermission } from '@/lib/authz';
import { logAudit } from '@/lib/audit';
import { notify, usersWithPermission, type Locale } from '@/lib/notify';

export interface DeskFormState {
  error?: string;
  success?: boolean;
}

const PATH = '/dashboard/experience/service-desk';

function str(f: FormData, key: string): string {
  return String(f.get(key) ?? '').trim();
}
function opt(f: FormData, key: string): string | null {
  const v = str(f, key);
  return v === '' ? null : v;
}

export async function openRequest(_p: DeskFormState, f: FormData): Promise<DeskFormState> {
  const auth = await requirePermission('experience.desk.request');
  if ('error' in auth) return { error: auth.error };
  const { supabase, tenantId, user } = auth;

  const subject = str(f, 'subject');
  if (!subject) return { error: 'Subject is required.' };

  const { data: myEmployee } = await supabase
    .from('employees')
    .select('id')
    .eq('user_id', user.id)
    .maybeSingle();

  const { data: request, error } = await supabase
    .from('service_requests')
    .insert({
      tenant_id: tenantId,
      employee_id: myEmployee?.id ?? null,
      opened_by: user.id,
      category: str(f, 'category') || 'other',
      subject,
      description: opt(f, 'description'),
      priority: str(f, 'priority') || 'normal',
      confidential: str(f, 'confidential') === 'true',
    })
    .select('id')
    .single();
  if (error) return { error: error.message };

  const { data: tenant } = await supabase
    .from('tenants').select('default_locale').eq('id', tenantId).maybeSingle();
  const agents = await usersWithPermission(supabase, tenantId, 'experience.desk.agent');
  await notify(supabase, {
    tenantId,
    userIds: agents.filter((a) => a !== user.id),
    template: 'desk_new_request',
    locale: (tenant?.default_locale as Locale) ?? 'en',
    params: { subject, category: str(f, 'category') || 'other', priority: str(f, 'priority') || 'normal' },
    category: 'service_desk',
    link: `${PATH}?request=${request.id}`,
  });

  await logAudit(supabase, {
    tenantId, actorUserId: user.id, action: 'service_request.opened',
    entityType: 'service_request', entityId: request.id,
    after: { subject, category: str(f, 'category') },
  });
  revalidatePath(PATH);
  return { success: true };
}

export async function replyToRequest(_p: DeskFormState, f: FormData): Promise<DeskFormState> {
  const auth = await requirePermission('experience.desk.request');
  if ('error' in auth) return { error: auth.error };
  const { supabase, tenantId, user } = auth;

  const requestId = str(f, 'request_id');
  const body = str(f, 'body');
  if (!body) return { error: 'Write a message first.' };
  const isInternal = str(f, 'is_internal') === 'true';

  const { data: request } = await supabase
    .from('service_requests')
    .select('id, subject, opened_by')
    .eq('id', requestId)
    .maybeSingle();
  if (!request) return { error: 'Request not found (or not yours).' };

  const { error } = await supabase.from('service_request_messages').insert({
    tenant_id: tenantId,
    request_id: requestId,
    author_user_id: user.id,
    body,
    is_internal: isInternal,
  });
  if (error) return { error: error.message };

  // Employee-visible replies notify the opener (unless they wrote it).
  if (!isInternal && request.opened_by !== user.id) {
    const { data: tenant } = await supabase
      .from('tenants').select('default_locale').eq('id', tenantId).maybeSingle();
    await notify(supabase, {
      tenantId,
      userIds: [request.opened_by as string],
      template: 'desk_reply',
      locale: (tenant?.default_locale as Locale) ?? 'en',
      params: { subject: request.subject as string },
      category: 'service_desk',
      link: `${PATH}?request=${requestId}`,
    });
  }
  revalidatePath(PATH);
  return { success: true };
}

export async function updateRequestStatus(_p: DeskFormState, f: FormData): Promise<DeskFormState> {
  const auth = await requirePermission('experience.desk.agent');
  if ('error' in auth) return { error: auth.error };
  const { supabase, tenantId, user } = auth;

  const requestId = str(f, 'request_id');
  const status = str(f, 'status');
  if (!['open', 'in_progress', 'resolved', 'closed'].includes(status)) {
    return { error: 'Invalid status.' };
  }

  const { data: request } = await supabase
    .from('service_requests')
    .select('id, subject, opened_by, status')
    .eq('id', requestId)
    .maybeSingle();
  if (!request) return { error: 'Request not found.' };

  const { error } = await supabase
    .from('service_requests')
    .update({
      status,
      assigned_to: user.id,
      resolved_at: ['resolved', 'closed'].includes(status) ? new Date().toISOString() : null,
    })
    .eq('id', requestId);
  if (error) return { error: error.message };

  const { data: tenant } = await supabase
    .from('tenants').select('default_locale').eq('id', tenantId).maybeSingle();
  await notify(supabase, {
    tenantId,
    userIds: [request.opened_by as string].filter((u) => u !== user.id),
    template: 'desk_status',
    locale: (tenant?.default_locale as Locale) ?? 'en',
    params: { subject: request.subject as string, status: status.replace(/_/g, ' ') },
    category: 'service_desk',
    link: `${PATH}?request=${requestId}`,
  });

  await logAudit(supabase, {
    tenantId, actorUserId: user.id, action: `service_request.${status}`,
    entityType: 'service_request', entityId: requestId,
    before: { status: request.status }, after: { status },
  });
  revalidatePath(PATH);
  return { success: true };
}

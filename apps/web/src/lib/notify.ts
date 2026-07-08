import type { SupabaseClient } from '@supabase/supabase-js';

// In-app notifications with EN/SW templates (blueprint §6.5). Email delivery
// hooks in here once SMTP / an edge function is configured — the queue is
// this table.

export type Locale = 'en' | 'sw';

type TemplateParams = Record<string, string | number>;

const TEMPLATES: Record<string, Record<Locale, { title: string; body: string }>> = {
  leave_submitted: {
    en: { title: 'Leave request awaiting your approval', body: '{employee} requested {days} day(s) of {type} ({from} → {to}).' },
    sw: { title: 'Ombi la likizo linasubiri idhini yako', body: '{employee} ameomba siku {days} za {type} ({from} → {to}).' },
  },
  leave_approved: {
    en: { title: 'Leave request approved', body: 'The {type} request for {from} → {to} was approved.' },
    sw: { title: 'Ombi la likizo limeidhinishwa', body: 'Ombi la {type} la {from} → {to} limeidhinishwa.' },
  },
  leave_rejected: {
    en: { title: 'Leave request rejected', body: 'The {type} request for {from} → {to} was rejected.' },
    sw: { title: 'Ombi la likizo limekataliwa', body: 'Ombi la {type} la {from} → {to} limekataliwa.' },
  },
  desk_new_request: {
    en: { title: 'New HR request: {subject}', body: '{category} request opened. Priority: {priority}.' },
    sw: { title: 'Ombi jipya la HR: {subject}', body: 'Ombi la {category} limefunguliwa. Kipaumbele: {priority}.' },
  },
  desk_reply: {
    en: { title: 'Reply on your HR request', body: 'Your request "{subject}" has a new reply.' },
    sw: { title: 'Jibu kwenye ombi lako la HR', body: 'Ombi lako "{subject}" lina jibu jipya.' },
  },
  desk_status: {
    en: { title: 'HR request {status}', body: 'Your request "{subject}" is now {status}.' },
    sw: { title: 'Ombi la HR {status}', body: 'Ombi lako "{subject}" sasa ni {status}.' },
  },
};

function fill(template: string, params: TemplateParams): string {
  return template.replace(/\{(\w+)\}/g, (_, key) => String(params[key] ?? `{${key}}`));
}

export function renderTemplate(
  key: string,
  locale: Locale,
  params: TemplateParams,
): { title: string; body: string } {
  const template = TEMPLATES[key]?.[locale] ?? TEMPLATES[key]?.en;
  if (!template) return { title: key, body: '' };
  return { title: fill(template.title, params), body: fill(template.body, params) };
}

export interface NotifyInput {
  tenantId: string;
  userIds: string[];
  template: string;
  params: TemplateParams;
  locale?: Locale;
  category?: string;
  link?: string;
}

/** Insert one in-app notification per recipient. Failures are non-fatal. */
export async function notify(supabase: SupabaseClient, input: NotifyInput): Promise<void> {
  const recipients = [...new Set(input.userIds)].filter(Boolean);
  if (recipients.length === 0) return;
  const { title, body } = renderTemplate(input.template, input.locale ?? 'en', input.params);
  await supabase.from('notifications').insert(
    recipients.map((userId) => ({
      tenant_id: input.tenantId,
      user_id: userId,
      category: input.category ?? 'general',
      title,
      body,
      link: input.link ?? null,
    })),
  );
}

/** Users holding a role that carries the given permission (for role fan-out). */
export async function usersWithPermission(
  supabase: SupabaseClient,
  tenantId: string,
  permission: string,
  cap = 10,
): Promise<string[]> {
  const { data } = await supabase
    .from('user_roles')
    .select('user_id, roles!inner(role_permissions!inner(permission_key))')
    .eq('tenant_id', tenantId)
    .eq('roles.role_permissions.permission_key', permission)
    .limit(cap);
  return [...new Set((data ?? []).map((r) => r.user_id as string))];
}

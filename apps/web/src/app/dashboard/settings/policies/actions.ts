'use server';

import { revalidatePath } from 'next/cache';
import { requirePermission } from '@/lib/authz';
import { logAudit } from '@/lib/audit';

export interface PolicyFormState {
  error?: string;
  success?: boolean;
}

function str(f: FormData, key: string): string {
  return String(f.get(key) ?? '').trim();
}
function opt(f: FormData, key: string): string | null {
  const v = str(f, key);
  return v === '' ? null : v;
}

export async function savePolicy(_p: PolicyFormState, f: FormData): Promise<PolicyFormState> {
  const auth = await requirePermission('settings.tenant.manage');
  if ('error' in auth) return { error: auth.error };
  const { supabase, tenantId, user } = auth;

  const id = opt(f, 'id');
  const values = {
    title: str(f, 'title'),
    category: str(f, 'category') || 'general',
    body: str(f, 'body'),
    is_active: str(f, 'is_active') !== 'false',
  };
  if (!values.title || !values.body) return { error: 'Title and policy text are required.' };
  if (values.body.length > 20_000) return { error: 'Keep each policy under 20,000 characters.' };

  const { error } = id
    ? await supabase.from('company_policies').update(values).eq('id', id)
    : await supabase
        .from('company_policies')
        .insert({ tenant_id: tenantId, created_by: user.id, ...values });
  if (error) return { error: error.message };

  await logAudit(supabase, {
    tenantId, actorUserId: user.id,
    action: `policy.${id ? 'updated' : 'created'}`,
    entityType: 'company_policy', entityId: id,
    after: { title: values.title, category: values.category, is_active: values.is_active },
  });
  revalidatePath('/dashboard/settings/policies');
  revalidatePath('/dashboard/ai');
  return { success: true };
}

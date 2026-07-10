'use server';

import { revalidatePath } from 'next/cache';
import { requirePermission } from '@/lib/authz';
import { logAudit } from '@/lib/audit';

export interface CompanyFormState {
  error?: string;
  success?: boolean;
}

const PATH = '/dashboard/settings/company';

function str(f: FormData, key: string): string {
  return String(f.get(key) ?? '').trim();
}
function opt(f: FormData, key: string): string | null {
  const v = str(f, key);
  return v === '' ? null : v;
}

/** Tenant-level company profile: display name, language, timezone, HR WhatsApp. */
export async function saveCompany(
  _p: CompanyFormState,
  f: FormData,
): Promise<CompanyFormState> {
  const auth = await requirePermission('settings.tenant.manage');
  if ('error' in auth) return { error: auth.error };
  const { supabase, tenantId, user } = auth;

  const name = str(f, 'name');
  const locale = str(f, 'default_locale');
  const timezone = str(f, 'timezone') || 'Africa/Dar_es_Salaam';
  const whatsapp = opt(f, 'hr_whatsapp_number');
  if (!name) return { error: 'Company name is required.' };
  if (locale !== 'en' && locale !== 'sw') return { error: 'Language must be English or Swahili.' };
  if (whatsapp && !/^\+?[0-9\s-]{7,20}$/.test(whatsapp)) {
    return { error: 'Enter a valid WhatsApp number (digits, optionally starting with +).' };
  }

  const { error } = await supabase
    .from('tenants')
    .update({ name, default_locale: locale, timezone, hr_whatsapp_number: whatsapp })
    .eq('id', tenantId);
  if (error) return { error: error.message };

  await logAudit(supabase, {
    tenantId, actorUserId: user.id, action: 'company.updated',
    entityType: 'tenant', entityId: tenantId,
    after: { name, locale, timezone },
  });
  revalidatePath(PATH, 'layout');
  return { success: true };
}

/** A legal entity's statutory details. */
export async function saveLegalEntity(
  _p: CompanyFormState,
  f: FormData,
): Promise<CompanyFormState> {
  const auth = await requirePermission('settings.tenant.manage');
  if ('error' in auth) return { error: auth.error };
  const { supabase, tenantId, user } = auth;

  const id = str(f, 'legal_entity_id');
  const name = str(f, 'name');
  const jurisdiction = str(f, 'jurisdiction');
  const sector = str(f, 'sector');
  if (!id || !name) return { error: 'Legal entity name is required.' };
  if (jurisdiction !== 'tz_mainland' && jurisdiction !== 'tz_zanzibar') {
    return { error: 'Invalid jurisdiction.' };
  }
  if (sector !== 'private' && sector !== 'public') return { error: 'Invalid sector.' };

  const { error } = await supabase
    .from('legal_entities')
    .update({
      name,
      registration_number: opt(f, 'registration_number'),
      tin: opt(f, 'tin'),
      jurisdiction,
      sector,
      address: opt(f, 'address'),
    })
    .eq('id', id)
    .eq('tenant_id', tenantId);
  if (error) return { error: error.message };

  await logAudit(supabase, {
    tenantId, actorUserId: user.id, action: 'legal_entity.updated',
    entityType: 'legal_entity', entityId: id,
    after: { name, jurisdiction, sector },
  });
  revalidatePath(PATH);
  return { success: true };
}

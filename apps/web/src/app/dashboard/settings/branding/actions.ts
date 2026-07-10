'use server';

import { revalidatePath } from 'next/cache';
import { randomUUID } from 'node:crypto';
import { requirePermission } from '@/lib/authz';
import { logAudit } from '@/lib/audit';
import { isHexColor, isTemplate } from '@/lib/payslip/branding';

export interface BrandingFormState {
  error?: string;
  success?: boolean;
}

const BUCKET = 'tenant-branding';
const MAX_LOGO_BYTES = 2 * 1024 * 1024;
const PATH = '/dashboard/settings/branding';

function str(f: FormData, key: string): string {
  return String(f.get(key) ?? '').trim();
}

/** Save template + colours + footer note (upsert one row per tenant). */
export async function saveBranding(
  _p: BrandingFormState,
  f: FormData,
): Promise<BrandingFormState> {
  const auth = await requirePermission('settings.tenant.manage');
  if ('error' in auth) return { error: auth.error };
  const { supabase, tenantId, user } = auth;

  const template = str(f, 'template');
  const brandColor = str(f, 'brand_color').toUpperCase();
  const accentColor = str(f, 'accent_color').toUpperCase();
  const footerNote = str(f, 'footer_note');

  if (!isTemplate(template)) return { error: 'Choose a valid template.' };
  if (!isHexColor(brandColor) || !isHexColor(accentColor)) {
    return { error: 'Colours must be 6-digit hex like #1D4ED8.' };
  }
  if (footerNote.length > 300) return { error: 'Keep the footer note under 300 characters.' };

  const { error } = await supabase.from('payslip_branding').upsert(
    {
      tenant_id: tenantId,
      template,
      brand_color: brandColor,
      accent_color: accentColor,
      footer_note: footerNote || null,
      updated_by: user.id,
    },
    { onConflict: 'tenant_id' },
  );
  if (error) return { error: error.message };

  await logAudit(supabase, {
    tenantId, actorUserId: user.id, action: 'branding.updated',
    entityType: 'payslip_branding', entityId: tenantId,
    after: { template, brandColor, accentColor },
  });
  revalidatePath(PATH);
  return { success: true };
}

/** Upload (replace) the company logo. */
export async function uploadLogo(
  _p: BrandingFormState,
  f: FormData,
): Promise<BrandingFormState> {
  const auth = await requirePermission('settings.tenant.manage');
  if ('error' in auth) return { error: auth.error };
  const { supabase, tenantId, user } = auth;

  const file = f.get('logo') as File | null;
  if (!file || file.size === 0) return { error: 'Choose a logo image.' };
  if (file.size > MAX_LOGO_BYTES) return { error: 'Logo must be under 2 MB.' };
  if (!file.type.startsWith('image/')) return { error: 'Logo must be an image (PNG, JPG or SVG).' };

  const ext = (file.name.split('.').pop() ?? 'png').replace(/[^a-z0-9]/gi, '').slice(0, 5);
  const path = `${tenantId}/logo-${randomUUID()}.${ext}`;

  const { error: uploadError } = await supabase.storage
    .from(BUCKET)
    .upload(path, file, { contentType: file.type, upsert: true });
  if (uploadError) return { error: `Upload failed: ${uploadError.message}` };

  // Remove the previous logo object, then point the row at the new one.
  const { data: existing } = await supabase
    .from('payslip_branding')
    .select('logo_path')
    .eq('tenant_id', tenantId)
    .maybeSingle();

  const { error: saveError } = await supabase.from('payslip_branding').upsert(
    { tenant_id: tenantId, logo_path: path, updated_by: user.id },
    { onConflict: 'tenant_id' },
  );
  if (saveError) {
    await supabase.storage.from(BUCKET).remove([path]);
    return { error: saveError.message };
  }
  const previous = existing?.logo_path as string | null;
  if (previous && previous !== path) {
    await supabase.storage.from(BUCKET).remove([previous]);
  }

  await logAudit(supabase, {
    tenantId, actorUserId: user.id, action: 'branding.logo_updated',
    entityType: 'payslip_branding', entityId: tenantId,
  });
  revalidatePath(PATH);
  return { success: true };
}

/** Remove the company logo (revert to the Stellix mark). */
export async function removeLogo(): Promise<void> {
  const auth = await requirePermission('settings.tenant.manage');
  if ('error' in auth) return;
  const { supabase, tenantId } = auth;

  const { data: existing } = await supabase
    .from('payslip_branding')
    .select('logo_path')
    .eq('tenant_id', tenantId)
    .maybeSingle();
  const path = existing?.logo_path as string | null;

  await supabase.from('payslip_branding')
    .update({ logo_path: null })
    .eq('tenant_id', tenantId);
  if (path) await supabase.storage.from(BUCKET).remove([path]);
  revalidatePath(PATH);
}

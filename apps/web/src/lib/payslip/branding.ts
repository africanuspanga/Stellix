import type { SupabaseClient } from '@supabase/supabase-js';

// Shared payslip-branding types, constants and resolver. Not server-only: the
// types and TEMPLATES/DEFAULT_BRANDING constants are imported by the client
// branding editor; the data functions below are only called from server code.

/** The four payslip templates a company can choose from. */
export type PayslipTemplate = 'classic' | 'modern' | 'minimal' | 'bold';

export interface PayslipBranding {
  template: PayslipTemplate;
  brandColor: string; // #RRGGBB
  accentColor: string; // #RRGGBB
  logoUrl: string | null;
  footerNote: string | null;
}

export const TEMPLATES: Array<{
  key: PayslipTemplate;
  name: string;
  description: string;
}> = [
  { key: 'modern', name: 'Modern', description: 'Coloured header band, clean cards' },
  { key: 'classic', name: 'Classic', description: 'Traditional ruled payslip' },
  { key: 'minimal', name: 'Minimal', description: 'Understated black & white, colour on net pay' },
  { key: 'bold', name: 'Bold', description: 'Large net-pay hero at the top' },
];

export const DEFAULT_BRANDING: PayslipBranding = {
  template: 'modern',
  brandColor: '#0F172A',
  accentColor: '#2563EB',
  logoUrl: null,
  footerNote: null,
};

const HEX = /^#[0-9A-Fa-f]{6}$/;
export function isHexColor(value: string): boolean {
  return HEX.test(value);
}
export function isTemplate(value: string): value is PayslipTemplate {
  return value === 'classic' || value === 'modern' || value === 'minimal' || value === 'bold';
}

const BUCKET = 'tenant-branding';

export function logoPublicUrl(
  supabase: SupabaseClient,
  logoPath: string | null,
): string | null {
  if (!logoPath) return null;
  const { data } = supabase.storage.from(BUCKET).getPublicUrl(logoPath);
  return data.publicUrl;
}

/** Resolve a tenant's payslip branding (RLS: members read), with defaults. */
export async function getBranding(
  supabase: SupabaseClient,
  tenantId: string,
): Promise<PayslipBranding> {
  const { data } = await supabase
    .from('payslip_branding')
    .select('template, brand_color, accent_color, logo_path, footer_note')
    .eq('tenant_id', tenantId)
    .maybeSingle();
  if (!data) return DEFAULT_BRANDING;
  return {
    template: isTemplate(data.template as string) ? (data.template as PayslipTemplate) : 'modern',
    brandColor: isHexColor(data.brand_color as string) ? (data.brand_color as string) : DEFAULT_BRANDING.brandColor,
    accentColor: isHexColor(data.accent_color as string) ? (data.accent_color as string) : DEFAULT_BRANDING.accentColor,
    logoUrl: logoPublicUrl(supabase, (data.logo_path as string | null) ?? null),
    footerNote: (data.footer_note as string | null) ?? null,
  };
}

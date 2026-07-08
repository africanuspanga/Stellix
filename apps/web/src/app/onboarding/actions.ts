'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { cookies } from 'next/headers';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { provisionTenant } from '@/lib/tenancy/provision';
import { ACTIVE_TENANT_COOKIE } from '@/lib/tenancy/context';

export interface OnboardingFormState {
  error?: string;
}

export async function createOrganization(
  _prev: OnboardingFormState,
  formData: FormData,
): Promise<OnboardingFormState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const companyName = String(formData.get('companyName') ?? '').trim();
  const jurisdiction = String(formData.get('jurisdiction') ?? 'tz_mainland');
  const sector = String(formData.get('sector') ?? 'private');

  if (companyName.length < 2) return { error: 'Company name is required.' };
  if (!['tz_mainland', 'tz_zanzibar'].includes(jurisdiction))
    return { error: 'Invalid jurisdiction.' };
  if (!['private', 'public'].includes(sector)) return { error: 'Invalid sector.' };

  let tenantId: string;
  try {
    const admin = createAdminClient();
    const result = await provisionTenant(admin, {
      userId: user.id,
      companyName,
      jurisdiction: jurisdiction as 'tz_mainland' | 'tz_zanzibar',
      sector: sector as 'private' | 'public',
    });
    tenantId = result.tenantId;
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Organization setup failed.' };
  }

  const cookieStore = await cookies();
  cookieStore.set(ACTIVE_TENANT_COOKIE, tenantId, {
    path: '/',
    httpOnly: true,
    sameSite: 'lax',
    maxAge: 60 * 60 * 24 * 365,
  });
  revalidatePath('/', 'layout');
  redirect('/dashboard');
}

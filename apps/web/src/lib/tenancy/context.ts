import 'server-only';
import { cookies } from 'next/headers';
import { createClient } from '@/lib/supabase/server';
import type { User } from '@supabase/supabase-js';

export const ACTIVE_TENANT_COOKIE = 'stx-tenant';

export interface TenantMembership {
  id: string;
  name: string;
  slug: string;
}

export interface TenancyContext {
  user: User;
  tenants: TenantMembership[];
  activeTenant: TenantMembership | null;
}

/**
 * Resolve the signed-in user, their tenant memberships (RLS-scoped), and the
 * active tenant from the stx-tenant cookie (validated against memberships,
 * falling back to the first). Returns null when not authenticated.
 */
export async function getTenancyContext(): Promise<TenancyContext | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: rows } = await supabase
    .from('tenants')
    .select('id, name, slug')
    .order('name');
  const tenants: TenantMembership[] = rows ?? [];

  const cookieStore = await cookies();
  const requested = cookieStore.get(ACTIVE_TENANT_COOKIE)?.value;
  const activeTenant =
    tenants.find((t) => t.id === requested) ?? tenants[0] ?? null;

  return { user, tenants, activeTenant };
}

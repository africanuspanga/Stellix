import 'server-only';
import { createClient } from '@/lib/supabase/server';
import { getTenancyContext, type TenancyContext } from '@/lib/tenancy/context';
import type { SupabaseClient } from '@supabase/supabase-js';

export interface ActionContext extends TenancyContext {
  supabase: SupabaseClient;
  tenantId: string;
  permissions: Set<string>;
}

/**
 * Resolve the acting user's permission set for a tenant from their role
 * grants. RLS is the hard tenant boundary; this is the app-layer permission
 * check on top of it (blueprint §8.1).
 */
export async function getUserPermissions(
  supabase: SupabaseClient,
  tenantId: string,
  userId: string,
): Promise<Set<string>> {
  const { data } = await supabase
    .from('user_roles')
    .select('roles(role_permissions(permission_key))')
    .eq('tenant_id', tenantId)
    .eq('user_id', userId);

  // Without generated DB types supabase-js can't tell to-one from to-many
  // embeds; normalize both shapes.
  type RoleEmbed = { role_permissions: Array<{ permission_key: string }> };
  const keys = new Set<string>();
  for (const row of (data ?? []) as unknown as Array<{ roles: RoleEmbed | RoleEmbed[] | null }>) {
    const roles = Array.isArray(row.roles) ? row.roles : row.roles ? [row.roles] : [];
    for (const role of roles) {
      for (const rp of role.role_permissions ?? []) {
        keys.add(rp.permission_key);
      }
    }
  }
  return keys;
}

/**
 * Shared entry point for server actions: authenticated user + active tenant
 * + permission check. Returns an error string (for form state) when the
 * requirement is not met.
 */
export async function requirePermission(
  permission: string,
): Promise<ActionContext | { error: string }> {
  const context = await getTenancyContext();
  if (!context) return { error: 'Not signed in.' };
  if (!context.activeTenant) return { error: 'No active workspace.' };

  const supabase = await createClient();
  const permissions = await getUserPermissions(
    supabase,
    context.activeTenant.id,
    context.user.id,
  );
  if (!permissions.has(permission)) {
    return { error: `You need the '${permission}' permission for this action.` };
  }
  return { ...context, supabase, tenantId: context.activeTenant.id, permissions };
}

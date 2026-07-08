import type { SupabaseClient } from '@supabase/supabase-js';
import { logAudit } from '../audit';

export interface ProvisionTenantInput {
  userId: string;
  companyName: string;
  legalEntityName?: string;
  jurisdiction: 'tz_mainland' | 'tz_zanzibar';
  sector: 'private' | 'public';
}

export interface ProvisionedTenant {
  tenantId: string;
  legalEntityId: string;
  adminRoleId: string;
}

// Default per-tenant roles and their permission grants. The `admin` role gets
// every permission in the catalogue at provisioning time.
const DEFAULT_ROLES: Array<{ name: string; description: string; permissions: string[] | 'all' }> = [
  { name: 'admin', description: 'Full tenant administration', permissions: 'all' },
  {
    name: 'hr_manager',
    description: 'HR management across the employee lifecycle',
    permissions: [
      'people.employee.read', 'people.employee.write', 'people.position.manage',
      'people.action.approve', 'time.attendance.read', 'time.attendance.manage',
      'time.leave.approve', 'time.roster.manage', 'compliance.dashboard.read',
      'experience.desk.agent', 'experience.announcement.manage',
      'ai.assistant.use', 'ai.assistant.draft', 'settings.users.manage',
    ],
  },
  {
    name: 'payroll_officer',
    description: 'Payroll preparation and processing',
    permissions: [
      'people.employee.read', 'payroll.run.read', 'payroll.run.prepare',
      'payroll.compensation.manage', 'payroll.loan.manage',
      'compliance.dashboard.read', 'compliance.filing.manage',
      'ai.assistant.use', 'ai.assistant.draft',
    ],
  },
  {
    name: 'manager',
    description: 'Team management and approvals',
    permissions: [
      'people.employee.read', 'time.attendance.read', 'time.leave.approve',
      'time.roster.manage', 'experience.desk.request', 'ai.assistant.use',
    ],
  },
  {
    name: 'employee',
    description: 'Self-service access',
    permissions: [
      'people.employee.self', 'time.leave.request',
      'experience.desk.request', 'ai.assistant.use',
    ],
  },
];

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
}

/**
 * Provision a new tenant: tenant → legal entity → membership → default roles
 * with permission grants → admin role for the creator → compliance pack
 * attachment → audit entry. Requires the service-role client (RLS does not
 * allow self-service tenant creation).
 */
export async function provisionTenant(
  admin: SupabaseClient,
  input: ProvisionTenantInput,
): Promise<ProvisionedTenant> {
  const baseSlug = slugify(input.companyName) || 'tenant';

  // Suffix the slug on collision rather than failing signup.
  let slug = baseSlug;
  for (let attempt = 0; ; attempt++) {
    const { data: existing } = await admin.from('tenants').select('id').eq('slug', slug).maybeSingle();
    if (!existing) break;
    slug = `${baseSlug}-${attempt + 2}`;
  }

  const { data: tenant, error: tenantError } = await admin
    .from('tenants')
    .insert({ name: input.companyName, slug })
    .select('id')
    .single();
  if (tenantError) throw new Error(`Tenant creation failed: ${tenantError.message}`);
  const tenantId = tenant.id as string;

  const { data: entity, error: entityError } = await admin
    .from('legal_entities')
    .insert({
      tenant_id: tenantId,
      name: input.legalEntityName || input.companyName,
      jurisdiction: input.jurisdiction,
      sector: input.sector,
    })
    .select('id')
    .single();
  if (entityError) throw new Error(`Legal entity creation failed: ${entityError.message}`);

  const { error: memberError } = await admin
    .from('tenant_users')
    .insert({ tenant_id: tenantId, user_id: input.userId });
  if (memberError) throw new Error(`Membership creation failed: ${memberError.message}`);

  const { data: allPermissions, error: permError } = await admin.from('permissions').select('key');
  if (permError) throw new Error(`Permission catalogue read failed: ${permError.message}`);
  const catalogue = new Set((allPermissions ?? []).map((p) => p.key as string));

  let adminRoleId = '';
  for (const role of DEFAULT_ROLES) {
    const { data: created, error: roleError } = await admin
      .from('roles')
      .insert({ tenant_id: tenantId, name: role.name, description: role.description, is_system: true })
      .select('id')
      .single();
    if (roleError) throw new Error(`Role '${role.name}' creation failed: ${roleError.message}`);

    const keys =
      role.permissions === 'all'
        ? [...catalogue]
        : role.permissions.filter((k) => catalogue.has(k));
    if (keys.length > 0) {
      const { error: grantError } = await admin
        .from('role_permissions')
        .insert(keys.map((key) => ({ role_id: created.id, permission_key: key })));
      if (grantError) throw new Error(`Grants for '${role.name}' failed: ${grantError.message}`);
    }
    if (role.name === 'admin') adminRoleId = created.id as string;
  }

  const { error: assignError } = await admin
    .from('user_roles')
    .insert({ tenant_id: tenantId, user_id: input.userId, role_id: adminRoleId });
  if (assignError) throw new Error(`Admin role assignment failed: ${assignError.message}`);

  // Attach the matching compliance pack if one exists for this jurisdiction+sector.
  const { data: pack } = await admin
    .from('compliance_packs')
    .select('id')
    .eq('jurisdiction', input.jurisdiction)
    .eq('sector', input.sector)
    .maybeSingle();
  if (pack) {
    await admin.from('legal_entity_compliance').insert({
      tenant_id: tenantId,
      legal_entity_id: entity.id,
      pack_id: pack.id,
      effective_from: new Date().toISOString().slice(0, 10),
    });
  }

  await logAudit(admin, {
    tenantId,
    actorUserId: input.userId,
    action: 'tenant.created',
    entityType: 'tenant',
    entityId: tenantId,
    after: { name: input.companyName, slug, jurisdiction: input.jurisdiction, sector: input.sector },
  });

  return { tenantId, legalEntityId: entity.id as string, adminRoleId };
}

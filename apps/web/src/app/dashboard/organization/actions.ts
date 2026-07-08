'use server';

import { revalidatePath } from 'next/cache';
import { requirePermission, type ActionContext } from '@/lib/authz';
import { logAudit } from '@/lib/audit';

export interface OrgFormState {
  error?: string;
  success?: boolean;
}

const ORG_PERMISSION = 'people.position.manage';
const ORG_PATH = '/dashboard/organization';

type Values = Record<string, unknown>;

function str(formData: FormData, key: string): string {
  return String(formData.get(key) ?? '').trim();
}
function opt(formData: FormData, key: string): string | null {
  const v = str(formData, key);
  return v === '' ? null : v;
}
function num(formData: FormData, key: string): number | null {
  const v = str(formData, key);
  if (v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/**
 * Shared upsert for org entities: permission check → insert or update via the
 * user's RLS-scoped client → audit entry → revalidate. `id` present = update.
 */
async function saveEntity(input: {
  table: string;
  entityType: string;
  id: string | null;
  values: Values;
  validate?: (v: Values) => string | null;
}): Promise<OrgFormState> {
  const auth = await requirePermission(ORG_PERMISSION);
  if ('error' in auth) return { error: auth.error };
  const { supabase, tenantId, user } = auth as ActionContext;

  const invalid = input.validate?.(input.values);
  if (invalid) return { error: invalid };

  let entityId = input.id;
  let before: unknown = null;

  if (input.id) {
    const { data: existing } = await supabase
      .from(input.table)
      .select('*')
      .eq('id', input.id)
      .eq('tenant_id', tenantId)
      .maybeSingle();
    if (!existing) return { error: 'Record not found.' };
    before = existing;

    const { error } = await supabase
      .from(input.table)
      .update(input.values)
      .eq('id', input.id)
      .eq('tenant_id', tenantId);
    if (error) return { error: friendly(error.message) };
  } else {
    const { data, error } = await supabase
      .from(input.table)
      .insert({ tenant_id: tenantId, ...input.values })
      .select('id')
      .single();
    if (error) return { error: friendly(error.message) };
    entityId = data.id as string;
  }

  await logAudit(supabase, {
    tenantId,
    actorUserId: user.id,
    action: `${input.entityType}.${input.id ? 'updated' : 'created'}`,
    entityType: input.entityType,
    entityId,
    before,
    after: input.values,
  });

  revalidatePath(ORG_PATH, 'layout');
  return { success: true };
}

function friendly(message: string): string {
  if (message.includes('duplicate key')) return 'A record with this name or code already exists.';
  if (message.includes('violates foreign key')) return 'A referenced record no longer exists.';
  return message;
}

// ── Branches ─────────────────────────────────────────────────────────────
export async function saveBranch(_p: OrgFormState, f: FormData): Promise<OrgFormState> {
  return saveEntity({
    table: 'branches',
    entityType: 'branch',
    id: opt(f, 'id'),
    values: {
      legal_entity_id: str(f, 'legal_entity_id'),
      name: str(f, 'name'),
      code: opt(f, 'code'),
      region: opt(f, 'region'),
      address: opt(f, 'address'),
      is_active: str(f, 'is_active') !== 'false',
    },
    validate: (v) => {
      if (!v.name) return 'Branch name is required.';
      if (!v.legal_entity_id) return 'Legal entity is required.';
      return null;
    },
  });
}

// ── Departments ──────────────────────────────────────────────────────────
export async function saveDepartment(_p: OrgFormState, f: FormData): Promise<OrgFormState> {
  const id = opt(f, 'id');
  const parent = opt(f, 'parent_department_id');
  return saveEntity({
    table: 'departments',
    entityType: 'department',
    id,
    values: {
      name: str(f, 'name'),
      code: opt(f, 'code'),
      legal_entity_id: opt(f, 'legal_entity_id'),
      parent_department_id: parent === id ? null : parent,
      is_active: str(f, 'is_active') !== 'false',
    },
    validate: (v) => (!v.name ? 'Department name is required.' : null),
  });
}

// ── Cost centres ─────────────────────────────────────────────────────────
export async function saveCostCentre(_p: OrgFormState, f: FormData): Promise<OrgFormState> {
  return saveEntity({
    table: 'cost_centres',
    entityType: 'cost_centre',
    id: opt(f, 'id'),
    values: {
      name: str(f, 'name'),
      code: str(f, 'code'),
      legal_entity_id: opt(f, 'legal_entity_id'),
      is_active: str(f, 'is_active') !== 'false',
    },
    validate: (v) => {
      if (!v.name) return 'Cost centre name is required.';
      if (!v.code) return 'Cost centre code is required.';
      return null;
    },
  });
}

// ── Job families & grades ────────────────────────────────────────────────
export async function saveJobFamily(_p: OrgFormState, f: FormData): Promise<OrgFormState> {
  return saveEntity({
    table: 'job_families',
    entityType: 'job_family',
    id: opt(f, 'id'),
    values: {
      name: str(f, 'name'),
      description: opt(f, 'description'),
    },
    validate: (v) => (!v.name ? 'Job family name is required.' : null),
  });
}

export async function saveJobGrade(_p: OrgFormState, f: FormData): Promise<OrgFormState> {
  const bandMin = num(f, 'band_min');
  const bandMax = num(f, 'band_max');
  return saveEntity({
    table: 'job_grades',
    entityType: 'job_grade',
    id: opt(f, 'id'),
    values: {
      name: str(f, 'name'),
      job_family_id: opt(f, 'job_family_id'),
      level: num(f, 'level'),
      band_min: bandMin,
      band_max: bandMax,
      currency: str(f, 'currency') || 'TZS',
    },
    validate: (v) => {
      if (!v.name) return 'Grade name is required.';
      if (bandMin !== null && bandMax !== null && bandMax < bandMin)
        return 'Salary band maximum must be at least the minimum.';
      return null;
    },
  });
}

// ── Positions ────────────────────────────────────────────────────────────
const POSITION_STATUSES = ['approved', 'budgeted', 'vacant', 'occupied', 'frozen', 'abolished'];

export async function savePosition(_p: OrgFormState, f: FormData): Promise<OrgFormState> {
  const id = opt(f, 'id');
  const reportsTo = opt(f, 'reports_to_position_id');
  const status = str(f, 'status') || 'approved';
  return saveEntity({
    table: 'positions',
    entityType: 'position',
    id,
    values: {
      code: str(f, 'code'),
      title: str(f, 'title'),
      legal_entity_id: str(f, 'legal_entity_id'),
      department_id: opt(f, 'department_id'),
      branch_id: opt(f, 'branch_id'),
      job_grade_id: opt(f, 'job_grade_id'),
      reports_to_position_id: reportsTo === id ? null : reportsTo,
      status,
      is_budgeted: str(f, 'is_budgeted') === 'true',
      headcount: num(f, 'headcount') ?? 1,
      budgeted_annual_cost: num(f, 'budgeted_annual_cost'),
    },
    validate: (v) => {
      if (!v.title) return 'Position title is required.';
      if (!v.code) return 'Position code is required.';
      if (!v.legal_entity_id) return 'Legal entity is required.';
      if (!POSITION_STATUSES.includes(status)) return 'Invalid status.';
      if (typeof v.headcount === 'number' && v.headcount < 1)
        return 'Headcount must be at least 1.';
      return null;
    },
  });
}

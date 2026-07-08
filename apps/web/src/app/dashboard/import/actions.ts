'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { requirePermission } from '@/lib/authz';
import { logAudit } from '@/lib/audit';
import {
  EMPLOYEE_IMPORT_FIELDS,
  guessMapping,
  parseSheet,
  runEmployeeImport,
  validateEmployeeRows,
} from '@/lib/imports/employees';

export interface ImportFormState {
  error?: string;
  success?: boolean;
}

const IMPORT_PATH = '/dashboard/import';
const MAX_FILE_BYTES = 5 * 1024 * 1024;

export async function createImport(
  _prev: ImportFormState,
  formData: FormData,
): Promise<ImportFormState> {
  const auth = await requirePermission('people.employee.write');
  if ('error' in auth) return { error: auth.error };
  const { supabase, tenantId, user } = auth;

  const file = formData.get('file') as File | null;
  if (!file || file.size === 0) return { error: 'Choose a CSV or Excel file.' };
  if (file.size > MAX_FILE_BYTES) return { error: 'File is larger than 5 MB.' };

  let parsed;
  try {
    parsed = parseSheet(Buffer.from(await file.arrayBuffer()));
  } catch (e) {
    return { error: `Could not parse file: ${e instanceof Error ? e.message : 'unknown error'}` };
  }
  if (parsed.headers.length === 0 || parsed.rows.length === 0) {
    return { error: 'The file has no data rows. The first row must be column headers.' };
  }

  const { data, error } = await supabase
    .from('imports')
    .insert({
      tenant_id: tenantId,
      import_type: 'employees',
      file_name: file.name,
      status: 'uploaded',
      headers: parsed.headers,
      rows: parsed.rows,
      mapping: guessMapping(parsed.headers),
      total_rows: parsed.rows.length,
      created_by: user.id,
    })
    .select('id')
    .single();
  if (error) return { error: error.message };

  revalidatePath(IMPORT_PATH);
  redirect(`${IMPORT_PATH}/${data.id}`);
}

export async function saveMappingAndValidate(
  _prev: ImportFormState,
  formData: FormData,
): Promise<ImportFormState> {
  const auth = await requirePermission('people.employee.write');
  if ('error' in auth) return { error: auth.error };
  const { supabase } = auth;

  const id = String(formData.get('id') ?? '');
  const { data: imp } = await supabase.from('imports').select('*').eq('id', id).maybeSingle();
  if (!imp) return { error: 'Import not found.' };
  if (imp.status === 'imported') return { error: 'This import has already run.' };

  const mapping: Record<string, number> = {};
  for (const field of EMPLOYEE_IMPORT_FIELDS) {
    const v = String(formData.get(`map_${field.key}`) ?? '');
    if (v !== '') mapping[field.key] = Number(v);
  }
  for (const field of EMPLOYEE_IMPORT_FIELDS) {
    if (field.required && mapping[field.key] === undefined) {
      return { error: `Map a column to the required field '${field.label}'.` };
    }
  }

  const { data: existing } = await supabase.from('employees').select('employee_number');
  const existingNumbers = new Set((existing ?? []).map((e) => e.employee_number as string));
  const result = validateEmployeeRows(imp.rows as string[][], mapping, existingNumbers);

  const { error } = await supabase
    .from('imports')
    .update({
      mapping,
      errors: result.errors,
      valid_rows: result.valid.length,
      status: 'validated',
    })
    .eq('id', id);
  if (error) return { error: error.message };

  revalidatePath(`${IMPORT_PATH}/${id}`);
  return { success: true };
}

export async function executeImport(
  _prev: ImportFormState,
  formData: FormData,
): Promise<ImportFormState> {
  const auth = await requirePermission('people.employee.write');
  if ('error' in auth) return { error: auth.error };
  const { supabase, tenantId, user } = auth;

  const id = String(formData.get('id') ?? '');
  const legalEntityId = String(formData.get('legal_entity_id') ?? '');
  if (!legalEntityId) return { error: 'Choose the legal entity to import into.' };

  const { data: imp } = await supabase.from('imports').select('*').eq('id', id).maybeSingle();
  if (!imp) return { error: 'Import not found.' };
  if (imp.status !== 'validated') return { error: 'Validate the mapping before importing.' };

  // Re-validate against current data (numbers may have been taken since).
  const { data: existing } = await supabase.from('employees').select('employee_number');
  const existingNumbers = new Set((existing ?? []).map((e) => e.employee_number as string));
  const result = validateEmployeeRows(
    imp.rows as string[][],
    imp.mapping as Record<string, number>,
    existingNumbers,
  );

  const summary = await runEmployeeImport(supabase, {
    tenantId,
    legalEntityId,
    userId: user.id,
    records: result.valid,
  });

  await supabase
    .from('imports')
    .update({
      status: 'imported',
      summary,
      errors: [...result.errors, ...summary.failed],
      valid_rows: summary.created,
      imported_at: new Date().toISOString(),
    })
    .eq('id', id);

  await logAudit(supabase, {
    tenantId,
    actorUserId: user.id,
    action: 'import.executed',
    entityType: 'import',
    entityId: id,
    after: { file: imp.file_name, created: summary.created, failed: summary.failed.length, skipped: result.errors.length },
  });

  revalidatePath('/dashboard', 'layout');
  return { success: true };
}

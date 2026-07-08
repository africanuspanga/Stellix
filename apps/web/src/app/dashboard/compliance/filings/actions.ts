'use server';

import { revalidatePath } from 'next/cache';
import { requirePermission } from '@/lib/authz';
import { logAudit } from '@/lib/audit';
import { generateFilingsFromRun } from '@/lib/compliance/filings';

export interface FilingFormState {
  error?: string;
  success?: boolean;
  message?: string;
}

const PATH = '/dashboard/compliance/filings';

export async function generateFilings(
  _p: FilingFormState,
  f: FormData,
): Promise<FilingFormState> {
  const auth = await requirePermission('compliance.filing.manage');
  if ('error' in auth) return { error: auth.error };
  const { supabase, tenantId, user } = auth;

  const runId = String(f.get('run_id') ?? '');
  if (!runId) return { error: 'Choose an approved payroll run.' };

  let result;
  try {
    result = await generateFilingsFromRun(supabase, runId, user.id);
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Generation failed.' };
  }

  await logAudit(supabase, {
    tenantId, actorUserId: user.id, action: 'statutory_filings.generated',
    entityType: 'statutory_filing', entityId: runId,
    after: result,
  });
  revalidatePath(PATH);
  return {
    success: true,
    message: `${result.created} filing(s) created${result.skipped > 0 ? `, ${result.skipped} already existed` : ''}.`,
  };
}

export async function updateFilingStatus(
  _p: FilingFormState,
  f: FormData,
): Promise<FilingFormState> {
  const auth = await requirePermission('compliance.filing.manage');
  if ('error' in auth) return { error: auth.error };
  const { supabase, tenantId, user } = auth;

  const id = String(f.get('id') ?? '');
  const status = String(f.get('status') ?? '');
  const reference = String(f.get('payment_reference') ?? '').trim();
  if (!['filed', 'paid', 'pending'].includes(status)) return { error: 'Invalid status.' };

  const { data: before } = await supabase
    .from('statutory_filings')
    .select('status, filing_type, period_year, period_month')
    .eq('id', id)
    .maybeSingle();
  if (!before) return { error: 'Filing not found.' };

  const { error } = await supabase
    .from('statutory_filings')
    .update({
      status,
      payment_reference: reference || null,
      filed_at: status !== 'pending' ? new Date().toISOString() : null,
      paid_at: status === 'paid' ? new Date().toISOString() : null,
      responsible_user_id: user.id,
    })
    .eq('id', id);
  if (error) return { error: error.message };

  await logAudit(supabase, {
    tenantId, actorUserId: user.id, action: `statutory_filing.${status}`,
    entityType: 'statutory_filing', entityId: id,
    before, after: { status, payment_reference: reference },
  });
  revalidatePath(PATH);
  return { success: true };
}

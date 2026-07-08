'use server';

import { randomUUID } from 'node:crypto';
import { revalidatePath } from 'next/cache';
import { requirePermission } from '@/lib/authz';
import { logAudit } from '@/lib/audit';

export interface InviteFormState {
  error?: string;
  success?: boolean;
  message?: string;
}

export async function generateInvite(
  _p: InviteFormState,
  f: FormData,
): Promise<InviteFormState> {
  const auth = await requirePermission('people.employee.write');
  if ('error' in auth) return { error: auth.error };
  const { supabase, tenantId, user } = auth;

  const employeeId = String(f.get('employee_id') ?? '');
  const { data: employee } = await supabase
    .from('employees')
    .select('id, first_name, user_id')
    .eq('id', employeeId)
    .maybeSingle();
  if (!employee) return { error: 'Employee not found.' };
  if (employee.user_id) return { error: 'This employee already has portal access.' };

  // One open invite per employee: reuse it if still valid.
  const { data: existing } = await supabase
    .from('employee_invites')
    .select('token, expires_at')
    .eq('employee_id', employeeId)
    .is('accepted_at', null)
    .gte('expires_at', new Date().toISOString())
    .maybeSingle();

  let token = existing?.token as string | undefined;
  if (!token) {
    token = `${randomUUID()}${randomUUID()}`.replace(/-/g, '');
    const expires = new Date();
    expires.setUTCDate(expires.getUTCDate() + 14);
    const { error } = await supabase.from('employee_invites').insert({
      tenant_id: tenantId,
      employee_id: employeeId,
      token,
      created_by: user.id,
      expires_at: expires.toISOString(),
    });
    if (error) return { error: error.message };

    await logAudit(supabase, {
      tenantId, actorUserId: user.id, action: 'employee_invite.created',
      entityType: 'employee_invite', entityId: employeeId,
      after: { expires_at: expires.toISOString() },
    });
  }

  const base = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';
  const link = `${base}/invite/${token}`;
  revalidatePath(`/dashboard/people/employees/${employeeId}`);
  return {
    success: true,
    message: `Share this link with ${employee.first_name} (valid 14 days): ${link} — or send it via WhatsApp: https://wa.me/?text=${encodeURIComponent(`Karibu Stellix! Fungua kiungo hiki kuweka akaunti yako: ${link}`)}`,
  };
}

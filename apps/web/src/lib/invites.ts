import type { SupabaseClient } from '@supabase/supabase-js';

// Invite acceptance core: turns a one-time token into a confirmed portal
// account linked to the employee record, with tenant membership and the
// employee role. Runs with the service-role client (the visitor has no
// session yet). Framework-free — the accept action and E2E share it.

export interface AcceptInviteInput {
  token: string;
  password: string;
  /** Fallback when the employee record has no email on file. */
  email?: string;
}

export interface AcceptInviteResult {
  userId: string;
  tenantId: string;
  employeeId: string;
  email: string;
}

/** True when the invite row is missing, already used, or past its expiry.
 *  Shared by the public invite page and the accept flow. */
export function isInviteInvalid(
  invite: { accepted_at: string | null; expires_at: string } | null,
): boolean {
  return (
    !invite ||
    invite.accepted_at !== null ||
    new Date(invite.expires_at).getTime() < Date.now()
  );
}

export async function acceptInvite(
  admin: SupabaseClient,
  input: AcceptInviteInput,
): Promise<AcceptInviteResult> {
  if (input.password.length < 8) throw new Error('Password must be at least 8 characters.');

  const { data: invite } = await admin
    .from('employee_invites')
    .select('*, employees(id, first_name, last_name, personal_email, work_email, user_id, tenant_id)')
    .eq('token', input.token)
    .maybeSingle();
  if (!invite) throw new Error('This invite link is not valid.');
  if (invite.accepted_at) throw new Error('This invite was already used.');
  if (new Date(invite.expires_at as string).getTime() < Date.now()) {
    throw new Error('This invite has expired — ask HR for a new one.');
  }

  const employee = invite.employees as {
    id: string; first_name: string; last_name: string;
    personal_email: string | null; work_email: string | null;
    user_id: string | null; tenant_id: string;
  } | null;
  if (!employee) throw new Error('The employee record behind this invite no longer exists.');
  if (employee.user_id) throw new Error('This employee already has portal access — just sign in.');

  // Prefer the email HR put on the employee record — the client-supplied
  // address is only a fallback when none is on file, so a leaked token can't
  // bind the account to an attacker's own email.
  const email =
    employee.work_email || employee.personal_email || input.email?.trim() || '';
  if (!email) throw new Error('Enter an email address to use for signing in.');

  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email,
    password: input.password,
    email_confirm: true, // invite IS the verification
    user_metadata: { full_name: `${employee.first_name} ${employee.last_name}` },
  });
  if (createError || !created.user) {
    throw new Error(
      createError?.message.includes('already been registered')
        ? 'An account with this email already exists — sign in instead, or use a different email.'
        : createError?.message ?? 'Account creation failed.',
    );
  }
  const userId = created.user.id;
  const tenantId = invite.tenant_id as string;

  const { data: employeeRole } = await admin
    .from('roles')
    .select('id')
    .eq('tenant_id', tenantId)
    .eq('name', 'employee')
    .maybeSingle();

  await admin.from('tenant_users').insert({ tenant_id: tenantId, user_id: userId });
  if (employeeRole) {
    await admin
      .from('user_roles')
      .insert({ tenant_id: tenantId, user_id: userId, role_id: employeeRole.id });
  }
  await admin.from('employees').update({ user_id: userId }).eq('id', employee.id);
  await admin
    .from('employee_invites')
    .update({ accepted_at: new Date().toISOString(), accepted_user_id: userId })
    .eq('id', invite.id);

  return { userId, tenantId, employeeId: employee.id, email };
}

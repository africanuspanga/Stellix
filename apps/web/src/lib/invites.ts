import type { SupabaseClient } from '@supabase/supabase-js';

// Invite acceptance core: turns a one-time token into a confirmed portal
// account linked to the employee record, with tenant membership and the
// employee role. Runs with the service-role client (the visitor has no
// session yet). Framework-free — the accept action and E2E share it.

/** Details the new hire completes about themselves during self-onboarding.
 *  All optional — the person fills what they can; HR sees it land on the record. */
export interface EmployeeProfileInput {
  dateOfBirth?: string;
  gender?: string;
  maritalStatus?: string;
  personalEmail?: string;
  phone?: string;
  physicalAddress?: string;
  nationalId?: string; // NIDA
  tin?: string;
  nssfNumber?: string;
  // Emergency contact
  emergencyName?: string;
  emergencyRelationship?: string;
  emergencyPhone?: string;
  // Payout details
  paymentMethod?: string; // bank | mobile_money
  bankName?: string;
  bankBranch?: string;
  accountName?: string;
  accountNumber?: string;
  mobileMoneyProvider?: string;
  mobileMoneyNumber?: string;
}

export interface AcceptInviteInput {
  token: string;
  password: string;
  /** Fallback when the employee record has no email on file. */
  email?: string;
  /** Self-service profile completion (self-onboarding). */
  profile?: EmployeeProfileInput;
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
  // ── Self-onboarding: write what the new hire filled in about themselves ──
  // Runs with the service role but is scoped to this one employee id, so it
  // only ever touches the record the invite belongs to.
  const p = input.profile;
  if (p) {
    const clean = (v?: string) => {
      const t = v?.trim();
      return t ? t : undefined;
    };
    const employeeUpdate: Record<string, unknown> = { user_id: userId };
    const set = (col: string, v?: string) => {
      const c = clean(v);
      if (c !== undefined) employeeUpdate[col] = c;
    };
    set('date_of_birth', p.dateOfBirth);
    if (p.gender === 'male' || p.gender === 'female') employeeUpdate.gender = p.gender;
    set('marital_status', p.maritalStatus);
    set('personal_email', p.personalEmail);
    set('phone', p.phone);
    set('physical_address', p.physicalAddress);
    set('national_id', p.nationalId);
    set('tin', p.tin);
    set('nssf_number', p.nssfNumber);
    await admin.from('employees').update(employeeUpdate).eq('id', employee.id);

    // Emergency contact → dependants (only if a name was given).
    if (clean(p.emergencyName)) {
      await admin.from('employee_dependants').insert({
        tenant_id: tenantId,
        employee_id: employee.id,
        full_name: clean(p.emergencyName),
        relationship: clean(p.emergencyRelationship) ?? 'other',
        phone: clean(p.emergencyPhone) ?? null,
        is_emergency_contact: true,
      });
    }

    // Payout details → primary bank account (only if enough was given).
    const method = p.paymentMethod === 'mobile_money' ? 'mobile_money' : 'bank';
    const hasBank = method === 'bank' && clean(p.accountNumber);
    const hasMomo = method === 'mobile_money' && clean(p.mobileMoneyNumber);
    if (hasBank || hasMomo) {
      const { data: existingBank } = await admin
        .from('employee_bank_accounts')
        .select('id')
        .eq('employee_id', employee.id)
        .limit(1);
      if ((existingBank?.length ?? 0) === 0) {
        await admin.from('employee_bank_accounts').insert({
          tenant_id: tenantId,
          employee_id: employee.id,
          payment_method: method,
          bank_name: clean(p.bankName) ?? null,
          bank_branch: clean(p.bankBranch) ?? null,
          account_name: clean(p.accountName) ?? `${employee.first_name} ${employee.last_name}`,
          account_number: clean(p.accountNumber) ?? null,
          mobile_money_provider: clean(p.mobileMoneyProvider) ?? null,
          mobile_money_number: clean(p.mobileMoneyNumber) ?? null,
          is_primary: true,
        });
      }
    }
  } else {
    await admin.from('employees').update({ user_id: userId }).eq('id', employee.id);
  }

  await admin
    .from('employee_invites')
    .update({ accepted_at: new Date().toISOString(), accepted_user_id: userId })
    .eq('id', invite.id);

  return { userId, tenantId, employeeId: employee.id, email };
}

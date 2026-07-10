'use server';

import { redirect } from 'next/navigation';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';
import { acceptInvite } from '@/lib/invites';
import { logAudit } from '@/lib/audit';

export interface AcceptFormState {
  error?: string;
}

export async function acceptInviteAction(
  _p: AcceptFormState,
  f: FormData,
): Promise<AcceptFormState> {
  const token = String(f.get('token') ?? '');
  const password = String(f.get('password') ?? '');
  const email = String(f.get('email') ?? '').trim();
  const s = (k: string) => {
    const v = String(f.get(k) ?? '').trim();
    return v || undefined;
  };

  const admin = createAdminClient();
  let result;
  try {
    result = await acceptInvite(admin, {
      token,
      password,
      email: email || undefined,
      profile: {
        dateOfBirth: s('date_of_birth'),
        gender: s('gender'),
        maritalStatus: s('marital_status'),
        personalEmail: s('personal_email'),
        phone: s('phone'),
        physicalAddress: s('physical_address'),
        nationalId: s('national_id'),
        tin: s('tin'),
        nssfNumber: s('nssf_number'),
        emergencyName: s('emergency_name'),
        emergencyRelationship: s('emergency_relationship'),
        emergencyPhone: s('emergency_phone'),
        paymentMethod: s('payment_method'),
        bankName: s('bank_name'),
        bankBranch: s('bank_branch'),
        accountName: s('account_name'),
        accountNumber: s('account_number'),
        mobileMoneyProvider: s('mobile_money_provider'),
        mobileMoneyNumber: s('mobile_money_number'),
      },
    });
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Invite acceptance failed.' };
  }

  await logAudit(admin, {
    tenantId: result.tenantId,
    actorUserId: result.userId,
    action: 'employee_invite.accepted',
    entityType: 'employee_invite',
    entityId: result.employeeId,
    after: { email: result.email },
  });

  // Sign the new user in and land them on the Huduma launcher.
  const supabase = await createClient();
  const { error: signInError } = await supabase.auth.signInWithPassword({
    email: result.email,
    password,
  });
  if (signInError) {
    redirect('/login');
  }
  redirect('/dashboard/huduma');
}

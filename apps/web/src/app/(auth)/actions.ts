'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { cookies } from 'next/headers';
import { createClient } from '@/lib/supabase/server';
import { ACTIVE_TENANT_COOKIE } from '@/lib/tenancy/context';

export interface AuthFormState {
  error?: string;
  message?: string;
}

export async function signIn(
  _prev: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const email = String(formData.get('email') ?? '').trim();
  const password = String(formData.get('password') ?? '');
  if (!email || !password) return { error: 'Email and password are required.' };

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) return { error: error.message };

  revalidatePath('/', 'layout');
  const next = String(formData.get('next') ?? '') || '/dashboard';
  redirect(next.startsWith('/') ? next : '/dashboard');
}

/** One-click sign-in to the Driftmark Technologies demo workspace. The
 *  credentials match scripts/seed-driftmark.mts (the seeded demo company) and
 *  can be overridden via env for non-default demo environments. */
export async function signInDemo(): Promise<AuthFormState> {
  const email = process.env.DEMO_LOGIN_EMAIL ?? 'demo-admin@driftmark.co.tz';
  const password = process.env.DEMO_LOGIN_PASSWORD ?? 'DriftmarkDemo2026!';

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    return {
      error: `Demo sign-in failed — has the Driftmark demo seed been run? (${error.message})`,
    };
  }

  revalidatePath('/', 'layout');
  redirect('/dashboard');
}

export async function signUp(
  _prev: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const fullName = String(formData.get('fullName') ?? '').trim();
  const email = String(formData.get('email') ?? '').trim();
  const password = String(formData.get('password') ?? '');
  if (!fullName || !email || !password) return { error: 'All fields are required.' };
  if (password.length < 8) return { error: 'Password must be at least 8 characters.' };

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: { full_name: fullName },
      emailRedirectTo: `${process.env.NEXT_PUBLIC_APP_URL}/auth/confirm`,
    },
  });
  if (error) return { error: error.message };

  // When email confirmation is disabled, a session is returned immediately.
  if (data.session) {
    revalidatePath('/', 'layout');
    redirect('/onboarding');
  }
  return {
    message: 'Check your email for a confirmation link, then sign in.',
  };
}

export async function signOut(): Promise<void> {
  const supabase = await createClient();
  await supabase.auth.signOut();
  const cookieStore = await cookies();
  cookieStore.delete(ACTIVE_TENANT_COOKIE);
  revalidatePath('/', 'layout');
  redirect('/login');
}

export async function setActiveTenant(tenantId: string): Promise<void> {
  // Membership is validated on read (getTenancyContext); an invalid id
  // simply falls back to the first membership.
  const cookieStore = await cookies();
  cookieStore.set(ACTIVE_TENANT_COOKIE, tenantId, {
    path: '/',
    httpOnly: true,
    sameSite: 'lax',
    maxAge: 60 * 60 * 24 * 365,
  });
  revalidatePath('/dashboard', 'layout');
}

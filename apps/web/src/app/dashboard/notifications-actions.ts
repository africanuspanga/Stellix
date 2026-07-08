'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { getTenancyContext } from '@/lib/tenancy/context';

export async function markAllNotificationsRead(): Promise<void> {
  const context = await getTenancyContext();
  if (!context) return;
  const supabase = await createClient();
  await supabase
    .from('notifications')
    .update({ read_at: new Date().toISOString() })
    .eq('user_id', context.user.id)
    .is('read_at', null);
  revalidatePath('/dashboard', 'layout');
}

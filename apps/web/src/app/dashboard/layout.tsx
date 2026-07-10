import { redirect } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { createClient } from "@/lib/supabase/server";
import { getTenancyContext } from "@/lib/tenancy/context";
import { isPlatformOwner } from "@/lib/platform/owner";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const context = await getTenancyContext();
  if (!context) redirect("/login");
  if (context.tenants.length === 0) redirect("/onboarding");

  const { user, tenants, activeTenant } = context;
  const name =
    (user.user_metadata?.full_name as string | undefined) ??
    user.email?.split("@")[0] ??
    "User";

  const supabase = await createClient();
  const [{ data: notificationRows }, owner] = await Promise.all([
    supabase
      .from("notifications")
      .select("id, title, body, link, read_at, created_at")
      .order("created_at", { ascending: false })
      .limit(10),
    isPlatformOwner(),
  ]);

  return (
    <AppShell
      isOwner={owner}
      activeTenantId={activeTenant?.id ?? null}
      notifications={(notificationRows ?? []).map((n) => ({
        id: n.id as string,
        title: n.title as string,
        body: n.body as string | null,
        link: n.link as string | null,
        createdAt: n.created_at as string,
        unread: n.read_at === null,
      }))}
      tenants={tenants}
      user={{ name, email: user.email ?? "" }}
    >
      {children}
    </AppShell>
  );
}

import { redirect } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { getTenancyContext } from "@/lib/tenancy/context";

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

  return (
    <AppShell
      activeTenantId={activeTenant?.id ?? null}
      tenants={tenants}
      user={{ name, email: user.email ?? "" }}
    >
      {children}
    </AppShell>
  );
}

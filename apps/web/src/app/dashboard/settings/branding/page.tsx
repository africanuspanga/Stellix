import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getTenancyContext } from "@/lib/tenancy/context";
import { getUserPermissions } from "@/lib/authz";
import { getBranding } from "@/lib/payslip/branding";
import { BrandingEditor } from "@/components/settings/branding-editor";

export const metadata: Metadata = { title: "Payslip branding — Stellix" };

export default async function BrandingSettingsPage() {
  const supabase = await createClient();
  const context = await getTenancyContext();
  if (!context?.activeTenant) redirect("/dashboard");

  const permissions = await getUserPermissions(
    supabase,
    context.activeTenant.id,
    context.user.id,
  );
  if (!permissions.has("settings.tenant.manage")) {
    redirect("/dashboard");
  }

  const branding = await getBranding(supabase, context.activeTenant.id);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-xl font-semibold tracking-tight">Payslip branding</h1>
        <p className="text-sm text-muted-foreground">
          Choose a template, set your colours and add your logo. Every payslip
          your team downloads carries your company&apos;s identity.
        </p>
      </div>
      <BrandingEditor initial={branding} />
    </div>
  );
}

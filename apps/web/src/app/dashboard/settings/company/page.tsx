import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getTenancyContext } from "@/lib/tenancy/context";
import { getUserPermissions } from "@/lib/authz";
import { CompanyForm } from "@/components/settings/company-form";
import { LegalEntityForm } from "@/components/settings/legal-entity-form";

export const metadata: Metadata = { title: "Company profile — Stellix" };

export default async function CompanySettingsPage() {
  const supabase = await createClient();
  const context = await getTenancyContext();
  if (!context?.activeTenant) redirect("/dashboard");

  const permissions = await getUserPermissions(
    supabase,
    context.activeTenant.id,
    context.user.id,
  );
  if (!permissions.has("settings.tenant.manage")) redirect("/dashboard");

  const [{ data: tenant }, { data: entities }] = await Promise.all([
    supabase
      .from("tenants")
      .select("name, default_locale, timezone, hr_whatsapp_number")
      .eq("id", context.activeTenant.id)
      .maybeSingle(),
    supabase
      .from("legal_entities")
      .select("id, name, registration_number, tin, jurisdiction, sector, address")
      .eq("tenant_id", context.activeTenant.id)
      .order("created_at"),
  ]);

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-1">
        <h1 className="text-xl font-semibold tracking-tight">Company profile</h1>
        <p className="text-sm text-muted-foreground">
          Your company details, language and legal entities. These feed payslips,
          statutory filings and the employee experience.
        </p>
      </div>

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-medium text-muted-foreground">Company</h2>
        <CompanyForm
          initial={{
            name: (tenant?.name as string) ?? context.activeTenant.name,
            defaultLocale: (tenant?.default_locale as string) ?? "en",
            timezone: (tenant?.timezone as string) ?? "Africa/Dar_es_Salaam",
            hrWhatsapp: (tenant?.hr_whatsapp_number as string) ?? "",
          }}
        />
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-medium text-muted-foreground">
          Legal entities ({(entities ?? []).length})
        </h2>
        <div className="flex flex-col gap-4">
          {(entities ?? []).map((e) => (
            <LegalEntityForm
              entity={{
                id: e.id as string,
                name: (e.name as string) ?? "",
                registrationNumber: (e.registration_number as string) ?? "",
                tin: (e.tin as string) ?? "",
                jurisdiction: (e.jurisdiction as string) ?? "tz_mainland",
                sector: (e.sector as string) ?? "private",
                address: (e.address as string) ?? "",
              }}
              key={e.id as string}
            />
          ))}
          {(entities ?? []).length === 0 && (
            <p className="text-sm text-muted-foreground">No legal entities yet.</p>
          )}
        </div>
      </section>
    </div>
  );
}

import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { getTenancyContext } from "@/lib/tenancy/context";
import { TenantSwitchButton } from "@/components/partner/tenant-switch-button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export const metadata: Metadata = { title: "Client overview — Stellix" };

export default async function PartnerPage() {
  const supabase = await createClient();
  const context = await getTenancyContext();
  const tenants = context?.tenants ?? [];
  const today = new Date().toISOString().slice(0, 10);

  // RLS returns rows for every tenant the user belongs to; group per client.
  const [{ data: employees }, { data: runs }, { data: filings }, { data: requests }] =
    await Promise.all([
      supabase.from("employees").select("tenant_id, status"),
      supabase
        .from("payroll_runs")
        .select("tenant_id, period_year, period_month, status")
        .order("period_year", { ascending: false })
        .order("period_month", { ascending: false }),
      supabase
        .from("statutory_filings")
        .select("tenant_id, status, due_date")
        .eq("status", "pending"),
      supabase
        .from("service_requests")
        .select("tenant_id, status")
        .in("status", ["open", "in_progress"]),
    ]);

  const stats = tenants.map((tenant) => {
    const tenantEmployees = (employees ?? []).filter((e) => e.tenant_id === tenant.id);
    const latestRun = (runs ?? []).find((r) => r.tenant_id === tenant.id);
    const overdueFilings = (filings ?? []).filter(
      (f) => f.tenant_id === tenant.id && (f.due_date as string) < today,
    );
    const openRequests = (requests ?? []).filter((r) => r.tenant_id === tenant.id);
    return { tenant, tenantEmployees, latestRun, overdueFilings, openRequests };
  });

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Client overview</h1>
        <p className="text-sm text-muted-foreground">
          {tenants.length === 1
            ? "You manage one workspace. HR partners managing multiple clients see them all here."
            : `${tenants.length} client workspaces — switch to work inside one.`}
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {stats.map(({ tenant, tenantEmployees, latestRun, overdueFilings, openRequests }) => (
          <Card
            className={`shadow-none ${tenant.id === context?.activeTenant?.id ? "ring-1 ring-foreground/30" : ""}`}
            key={tenant.id}
          >
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle>{tenant.name}</CardTitle>
                {tenant.id === context?.activeTenant?.id && (
                  <Badge className="mt-1" variant="outline">active workspace</Badge>
                )}
              </div>
              <TenantSwitchButton
                isActive={tenant.id === context?.activeTenant?.id}
                tenantId={tenant.id}
              />
            </CardHeader>
            <CardContent className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <p className="text-xs text-muted-foreground">Employees</p>
                <p className="font-mono">
                  {tenantEmployees.filter((e) => e.status !== "exited").length}
                </p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Latest payroll</p>
                <p>
                  {latestRun ? (
                    <>
                      <span className="font-mono">
                        {latestRun.period_year}-{String(latestRun.period_month).padStart(2, "0")}
                      </span>{" "}
                      <Badge variant={latestRun.status === "closed" ? "outline" : "secondary"}>
                        {latestRun.status}
                      </Badge>
                    </>
                  ) : (
                    "—"
                  )}
                </p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Overdue filings</p>
                <p>
                  {overdueFilings.length > 0 ? (
                    <Badge variant="destructive">{overdueFilings.length}</Badge>
                  ) : (
                    <span className="font-mono">0</span>
                  )}
                </p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Open HR requests</p>
                <p className="font-mono">{openRequests.length}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

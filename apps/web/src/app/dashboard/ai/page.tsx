import type { Metadata } from "next";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getTenancyContext } from "@/lib/tenancy/context";
import { getUserPermissions } from "@/lib/authz";
import { fullName, getEmployees } from "@/lib/people/queries";
import { askAgent, askAnomalies, askPayslip, askPolicy } from "@/app/dashboard/ai/actions";
import { AssistantForm } from "@/components/ai/assistant-form";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export const metadata: Metadata = { title: "AI assistant — Stellix" };

export default async function AiAssistantPage() {
  const supabase = await createClient();
  const context = await getTenancyContext();
  const permissions = context?.activeTenant
    ? await getUserPermissions(supabase, context.activeTenant.id, context.user.id)
    : new Set<string>();
  const isPayrollStaff = permissions.has("payroll.run.read");

  // Payslips the caller can actually see (RLS: own, or all for payroll staff).
  const [{ data: lines }, { data: runMeta }, { data: policies }, employees] = await Promise.all([
    supabase
      .from("payroll_run_lines")
      .select("run_id, employee_id, employee_name")
      .order("created_at", { ascending: false })
      .limit(200),
    supabase
      .from("payslip_run_meta")
      .select("id, period_year, period_month, status"),
    supabase.from("company_policies").select("id").eq("is_active", true),
    getEmployees(supabase),
  ]);
  const metaById = new Map((runMeta ?? []).map((r) => [r.id as string, r]));
  const employeeNameById = new Map(employees.map((e) => [e.id, fullName(e)]));

  const payslipOptions = (lines ?? [])
    .map((l) => {
      const meta = metaById.get(l.run_id as string);
      if (!meta || !["approved", "paid", "closed"].includes(meta.status as string)) return null;
      const period = `${meta.period_year}-${String(meta.period_month).padStart(2, "0")}`;
      return {
        value: `${l.run_id}|${l.employee_id}`,
        label: `${period} · ${employeeNameById.get(l.employee_id as string) ?? l.employee_name}`,
      };
    })
    .filter(Boolean) as Array<{ value: string; label: string }>;

  const { data: runs } = isPayrollStaff
    ? await supabase
        .from("payroll_runs")
        .select("id, period_year, period_month, status")
        .order("period_year", { ascending: false })
        .order("period_month", { ascending: false })
        .limit(24)
    : { data: [] };

  return (
    <div className="flex flex-col gap-6">
      <div>
        <div className="flex items-center gap-2">
          <h1 className="text-xl font-semibold tracking-tight">AI assistant</h1>
          <Badge variant="outline">explains — never calculates</Badge>
        </div>
        <p className="text-sm text-muted-foreground">
          Powered by Kimi. Every conversation is recorded in the AI audit
          trail with its data sources. Ask in English or Swahili.
        </p>
      </div>

      <Card className="shadow-none">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            Stellix agent
            <Badge variant="outline">acts with your permissions</Badge>
          </CardTitle>
          <p className="text-xs text-muted-foreground">
            Plans and acts through the same permission-checked operations the
            buttons use. Reads run freely; writes become proposals for you to
            confirm; payroll approval and payments always stay human. Try
            &ldquo;how many people are on leave?&rdquo; or &ldquo;raise a bank
            change request for me&rdquo;.
          </p>
        </CardHeader>
        <CardContent>
          <AssistantForm
            action={askAgent}
            questionPlaceholder="e.g. Find Juma's latest payslip and explain the PAYE"
            submitLabel="Ask the agent"
          />
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card className="shadow-none">
          <CardHeader>
            <CardTitle>Policy questions</CardTitle>
            <p className="text-xs text-muted-foreground">
              Answers only from your published company policies (
              {(policies ?? []).length} active
              {permissions.has("settings.tenant.manage") && (
                <>
                  {" · "}
                  <Link className="underline underline-offset-2" href="/dashboard/settings/policies">
                    manage policies
                  </Link>
                </>
              )}
              ).
            </p>
          </CardHeader>
          <CardContent>
            <AssistantForm
              action={askPolicy}
              questionPlaceholder="e.g. Naweza kuhamisha siku ngapi za likizo mwakani?"
              submitLabel="Ask"
            />
          </CardContent>
        </Card>

        <Card className="shadow-none">
          <CardHeader>
            <CardTitle>Payslip explainer</CardTitle>
            <p className="text-xs text-muted-foreground">
              Narrates the deterministic calculation trace — which rules
              applied, why the numbers are what they are, what changed vs last
              month.
            </p>
          </CardHeader>
          <CardContent>
            <PayslipForm options={payslipOptions} />
          </CardContent>
        </Card>
      </div>

      {isPayrollStaff && (
        <Card className="shadow-none">
          <CardHeader>
            <CardTitle>Payroll run review notes</CardTitle>
            <p className="text-xs text-muted-foreground">
              Summarizes the variance engine&apos;s findings into reviewer notes
              before approval.
            </p>
          </CardHeader>
          <CardContent>
            <AssistantForm
              action={askAnomalies}
              fixedQuestion
              selects={[{
                name: "run_id",
                label: "Payroll run",
                options: (runs ?? []).map((r) => ({
                  value: r.id,
                  label: `${r.period_year}-${String(r.period_month).padStart(2, "0")} (${r.status})`,
                })),
              }]}
              submitLabel="Summarize for review"
            />
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// Small wrapper: the payslip select carries run_id|employee_id in one value.
function PayslipForm({ options }: { options: Array<{ value: string; label: string }> }) {
  async function askPayslipCombined(
    prev: Awaited<ReturnType<typeof askPayslip>>,
    f: FormData,
  ): Promise<Awaited<ReturnType<typeof askPayslip>>> {
    "use server";
    const combined = String(f.get("payslip") ?? "");
    const [runId, employeeId] = combined.split("|");
    const next = new FormData();
    next.set("run_id", runId ?? "");
    next.set("employee_id", employeeId ?? "");
    next.set("question", String(f.get("question") ?? ""));
    return askPayslip(prev, next);
  }

  if (options.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No finalized payslips yet — a payroll run must be approved before its
        payslips can be explained.
      </p>
    );
  }

  return (
    <AssistantForm
      action={askPayslipCombined}
      questionLabel="Your question (optional)"
      questionPlaceholder="e.g. Kwa nini mshahara wangu umepungua mwezi huu?"
      selects={[{ name: "payslip", label: "Payslip", options }]}
      submitLabel="Explain"
    />
  );
}

import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { formatMoney } from "@/lib/org/queries";
import {
  addRunInput,
  approveRun,
  calculateRun,
  closeRun,
  markRunPaid,
  reverseRun,
} from "@/app/dashboard/payroll/runs/actions";
import { OrgFormDialog, type FieldDef } from "@/components/org/org-form-dialog";
import { BulkInputUpload } from "@/components/payroll/bulk-input-upload";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { VarianceFinding } from "@/lib/payroll/variance";

export const metadata: Metadata = { title: "Payroll run — Stellix" };

const STATUS_VARIANT: Record<string, "default" | "secondary" | "outline" | "destructive"> = {
  draft: "outline", calculated: "secondary", approved: "default",
  paid: "default", closed: "outline", reversed: "destructive",
};

function confirmDialog(
  action: (prev: { error?: string; success?: boolean }, f: FormData) => Promise<{ error?: string; success?: boolean }>,
  runId: string,
  title: string,
  triggerLabel: string,
  description: string,
  variant: "default" | "outline" = "default",
) {
  return (
    <OrgFormDialog
      action={action}
      description={description}
      fields={[{ name: "run_id", type: "hidden", label: "", defaultValue: runId }]}
      submitLabel={title}
      title={title}
      triggerLabel={triggerLabel}
      triggerVariant={variant}
    />
  );
}

export default async function RunDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: run } = await supabase
    .from("payroll_runs")
    .select("*, legal_entities(name)")
    .eq("id", id)
    .maybeSingle();
  if (!run) notFound();

  const { data: lines } = await supabase
    .from("payroll_run_lines")
    .select("*")
    .eq("run_id", id)
    .order("employee_number");

  const totals = run.totals as
    | { gross: number; paye: number; net: number; employerCost: number; employees: number }
    | null;
  const variances = ((run.variances as VarianceFinding[] | null) ?? []).slice(0, 50);
  const editable = ["draft", "calculated"].includes(run.status as string);
  const exportable = ["approved", "paid", "closed"].includes(run.status as string);
  const period = `${run.period_year}-${String(run.period_month).padStart(2, "0")}`;

  const inputFields = (employeeId: string): FieldDef[] => [
    { name: "run_id", type: "hidden", label: "", defaultValue: id },
    { name: "employee_id", type: "hidden", label: "", defaultValue: employeeId },
    { name: "name", label: "Input name", required: true, placeholder: "e.g. Performance bonus" },
    {
      name: "input_type", label: "Type", type: "select",
      options: [
        { value: "earning", label: "Earning (bonus, overtime pay…)" },
        { value: "deduction", label: "Deduction (advance recovery…)" },
      ],
    },
    { name: "amount", label: "Amount (TZS)", type: "number", step: "0.01", required: true },
    {
      name: "taxable", label: "Taxable", type: "select",
      options: [{ value: "true", label: "Taxable" }, { value: "false", label: "Non-taxable" }],
    },
  ];

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-semibold tracking-tight">
              Payroll {period} · {(run.legal_entities as { name?: string } | null)?.name}
            </h1>
            <Badge variant={STATUS_VARIANT[run.status] ?? "outline"}>{run.status}</Badge>
          </div>
          <p className="text-xs text-muted-foreground">
            <Link className="underline underline-offset-2" href="/dashboard/payroll/runs">
              ← all runs
            </Link>
            {run.approved_at && ` · approved ${String(run.approved_at).slice(0, 10)}`}
            {run.paid_at && ` · paid ${String(run.paid_at).slice(0, 10)}`}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {editable &&
            confirmDialog(calculateRun, id, "Calculate run", run.status === "draft" ? "Calculate" : "Recalculate",
              "Computes every employee from current inputs and effective-dated rules, and refreshes variance findings.")}
          {run.status === "calculated" &&
            confirmDialog(approveRun, id, "Approve run", "Approve",
              "Approval freezes this run permanently — lines become immutable at the database level. Corrections after approval require a reversal or adjustment run.")}
          {run.status === "approved" &&
            confirmDialog(markRunPaid, id, "Mark as paid", "Mark paid",
              "Confirms salary payments have been released. Requires the payment-release permission.")}
          {run.status === "paid" &&
            confirmDialog(closeRun, id, "Close run", "Close",
              "Closes the period after statutory filings.", "outline")}
          {exportable &&
            confirmDialog(reverseRun, id, "Reverse run", "Reverse",
              "Marks the run reversed for correction via an adjustment run. The original data is preserved.", "outline")}
        </div>
      </div>

      {totals && (
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
          {[
            { label: "Employees", value: String(totals.employees) },
            { label: "Gross", value: formatMoney(totals.gross) },
            { label: "PAYE", value: formatMoney(totals.paye) },
            { label: "Net pay", value: formatMoney(totals.net) },
            { label: "Employer cost", value: formatMoney(totals.employerCost) },
          ].map((stat) => (
            <Card className="shadow-none" key={stat.label}>
              <CardHeader>
                <CardTitle className="font-mono text-lg">{stat.value}</CardTitle>
                <p className="text-xs text-muted-foreground">{stat.label}</p>
              </CardHeader>
            </Card>
          ))}
        </div>
      )}

      {exportable && (
        <div className="flex flex-wrap gap-2 rounded-xl border p-4 text-sm">
          <span className="font-medium">Exports:</span>
          <a className="underline underline-offset-2" href={`/dashboard/payroll/runs/${id}/export/bank`}>Bank file (CSV)</a>
          <a className="underline underline-offset-2" href={`/dashboard/payroll/runs/${id}/export/mobile`}>Mobile money (CSV)</a>
          <a className="underline underline-offset-2" href={`/dashboard/payroll/runs/${id}/export/paye`}>PAYE schedule</a>
          <a className="underline underline-offset-2" href={`/dashboard/payroll/runs/${id}/export/pension`}>Pension schedule</a>
          <a className="underline underline-offset-2" href={`/dashboard/payroll/runs/${id}/export/sdl_wcf`}>SDL/WCF schedule</a>
        </div>
      )}
      {run.status === "calculated" && (
        <p className="text-xs text-muted-foreground">
          Payment files and statutory schedules unlock after approval.
        </p>
      )}

      {variances.length > 0 && (
        <Card className="shadow-none">
          <CardHeader>
            <CardTitle>Variance findings ({variances.length})</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Type</TableHead>
                  <TableHead>Employee</TableHead>
                  <TableHead>Detail</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {variances.map((v, i) => (
                  <TableRow key={i}>
                    <TableCell>
                      <Badge
                        variant={
                          ["negative_net", "missing_employee", "below_minimum_wage"].includes(v.type)
                            ? "destructive"
                            : "outline"
                        }
                      >
                        {v.type.replace(/_/g, " ")}
                      </Badge>
                    </TableCell>
                    <TableCell className="font-medium">{v.employeeName}</TableCell>
                    <TableCell className="text-sm">{v.detail}</TableCell>
                    <TableCell className="text-right font-mono text-xs">
                      {formatMoney(v.amount)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      <section className="flex flex-col gap-3">
        <h2 className="font-medium">
          Lines ({(lines ?? []).length})
          {editable && (
            <span className="ml-2 text-xs font-normal text-muted-foreground">
              adding an input recalculates that employee instantly
            </span>
          )}
        </h2>
        {editable && <BulkInputUpload runId={id} />}
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Employee</TableHead>
              <TableHead className="text-right">Basic</TableHead>
              <TableHead className="text-right">Gross</TableHead>
              <TableHead className="text-right">PAYE</TableHead>
              <TableHead className="text-right">Net pay</TableHead>
              <TableHead>Payment</TableHead>
              <TableHead className="w-40" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {(lines ?? []).length === 0 && (
              <TableRow>
                <TableCell className="text-muted-foreground" colSpan={7}>
                  No lines yet — run Calculate.
                </TableCell>
              </TableRow>
            )}
            {(lines ?? []).map((line) => {
              const payment = line.payment as { method?: string } | null;
              return (
                <TableRow key={line.id}>
                  <TableCell className="font-medium">
                    {line.employee_name}
                    <span className="ml-1 font-mono text-xs text-muted-foreground">
                      {line.employee_number}
                    </span>
                  </TableCell>
                  <TableCell className="text-right font-mono text-xs">{formatMoney(Number(line.basic_salary))}</TableCell>
                  <TableCell className="text-right font-mono text-xs">{formatMoney(Number(line.gross_pay))}</TableCell>
                  <TableCell className="text-right font-mono text-xs">{formatMoney(Number(line.paye))}</TableCell>
                  <TableCell className="text-right font-mono text-xs font-semibold">{formatMoney(Number(line.net_pay))}</TableCell>
                  <TableCell>
                    <Badge variant="outline">{payment?.method?.replace(/_/g, " ") ?? "unset"}</Badge>
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-2">
                      {editable && (
                        <OrgFormDialog
                          action={addRunInput}
                          description="The employee's line recalculates immediately — the previous vs new impact is shown on save."
                          fields={inputFields(line.employee_id as string)}
                          submitLabel="Add & recalculate"
                          title={`One-off input — ${line.employee_name}`}
                          triggerLabel="Adjust"
                          triggerVariant="outline"
                        />
                      )}
                      <Link
                        className="self-center text-xs underline underline-offset-2 hover:text-foreground"
                        href={`/dashboard/payroll/runs/${id}/payslip/${line.employee_id}`}
                      >
                        Payslip
                      </Link>
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </section>
    </div>
  );
}

import type { Metadata } from "next";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { formatMoney } from "@/lib/org/queries";
import { daysUntil } from "@/lib/people/queries";
import { generateFilings, updateFilingStatus } from "@/app/dashboard/compliance/filings/actions";
import { OrgFormDialog, type FieldDef } from "@/components/org/org-form-dialog";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export const metadata: Metadata = { title: "Statutory filings — Stellix" };

export default async function FilingsPage() {
  const supabase = await createClient();
  const [{ data: filings }, { data: approvedRuns }] = await Promise.all([
    supabase
      .from("statutory_filings")
      .select("*, legal_entities(name)")
      .order("due_date", { ascending: false })
      .limit(100),
    supabase
      .from("payroll_runs")
      .select("id, period_year, period_month, status")
      .in("status", ["approved", "paid", "closed"])
      .order("period_year", { ascending: false })
      .order("period_month", { ascending: false })
      .limit(24),
  ]);

  const generateFields: FieldDef[] = [
    {
      name: "run_id", label: "Approved payroll run", type: "select", required: true,
      options: (approvedRuns ?? []).map((r) => ({
        value: r.id,
        label: `${r.period_year}-${String(r.period_month).padStart(2, "0")} (${r.status})`,
      })),
    },
  ];

  const statusFields = (id: string): FieldDef[] => [
    { name: "id", type: "hidden", label: "", defaultValue: id },
    {
      name: "status", label: "Status", type: "select", required: true,
      options: [
        { value: "filed", label: "Filed (schedule submitted)" },
        { value: "paid", label: "Paid (with reference)" },
        { value: "pending", label: "Back to pending" },
      ],
    },
    { name: "payment_reference", label: "Payment / receipt reference" },
  ];

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Statutory filings</h1>
          <p className="text-sm text-muted-foreground">
            PAYE, NSSF, SDL and WCF obligations per period ·{" "}
            <Link className="underline underline-offset-2" href="/dashboard/compliance">
              ← compliance dashboard
            </Link>
            . Due dates follow common practice — verify against current filing
            calendars.
          </p>
        </div>
        <OrgFormDialog
          action={generateFilings}
          description="Creates PAYE, NSSF (employee+employer), SDL and WCF filing records from the run's immutable totals."
          fields={generateFields}
          submitLabel="Generate filings"
          title="Generate from payroll run"
          triggerLabel="Generate from run"
        />
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Type</TableHead>
            <TableHead>Period</TableHead>
            <TableHead>Entity</TableHead>
            <TableHead>Due</TableHead>
            <TableHead className="text-right">Amount</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Reference</TableHead>
            <TableHead className="w-24" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {(filings ?? []).length === 0 && (
            <TableRow>
              <TableCell className="text-muted-foreground" colSpan={8}>
                No filings yet — generate them from an approved payroll run.
              </TableCell>
            </TableRow>
          )}
          {(filings ?? []).map((filing) => {
            const days = daysUntil(filing.due_date as string);
            const overdue = filing.status === "pending" && days !== null && days < 0;
            return (
              <TableRow key={filing.id}>
                <TableCell className="font-mono text-xs uppercase">{filing.filing_type}</TableCell>
                <TableCell className="font-mono text-xs">
                  {filing.period_year}-{String(filing.period_month).padStart(2, "0")}
                </TableCell>
                <TableCell>{(filing.legal_entities as { name?: string } | null)?.name ?? "—"}</TableCell>
                <TableCell>
                  {overdue ? (
                    <Badge variant="destructive">{-days!}d overdue</Badge>
                  ) : (
                    <span className="font-mono text-xs">{filing.due_date}</span>
                  )}
                </TableCell>
                <TableCell className="text-right font-mono text-xs">
                  {formatMoney(Number(filing.amount))}
                </TableCell>
                <TableCell>
                  <Badge
                    variant={
                      filing.status === "paid"
                        ? "default"
                        : filing.status === "filed"
                          ? "secondary"
                          : "outline"
                    }
                  >
                    {filing.status}
                  </Badge>
                </TableCell>
                <TableCell className="font-mono text-xs">
                  {filing.payment_reference ?? "—"}
                </TableCell>
                <TableCell>
                  <OrgFormDialog
                    action={updateFilingStatus}
                    fields={statusFields(filing.id)}
                    submitLabel="Update"
                    title={`Update ${String(filing.filing_type).toUpperCase()} ${filing.period_year}-${String(filing.period_month).padStart(2, "0")}`}
                    triggerLabel="Update"
                    triggerVariant="outline"
                  />
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}

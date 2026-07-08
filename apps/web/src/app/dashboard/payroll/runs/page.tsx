import type { Metadata } from "next";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getLegalEntities, formatMoney } from "@/lib/org/queries";
import { createRun } from "@/app/dashboard/payroll/runs/actions";
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

export const metadata: Metadata = { title: "Payroll runs — Stellix" };

const RUN_STATUS_VARIANT: Record<string, "default" | "secondary" | "outline" | "destructive"> = {
  draft: "outline",
  calculated: "secondary",
  approved: "default",
  paid: "default",
  closed: "outline",
  reversed: "destructive",
};

export default async function PayrollRunsPage() {
  const supabase = await createClient();
  const now = new Date();
  const [entities, { data: runs }] = await Promise.all([
    getLegalEntities(supabase),
    supabase
      .from("payroll_runs")
      .select("*, legal_entities(name)")
      .order("period_year", { ascending: false })
      .order("period_month", { ascending: false })
      .limit(50),
  ]);

  const createFields: FieldDef[] = [
    {
      name: "legal_entity_id", label: "Legal entity", type: "select", required: true,
      options: entities.map((e) => ({ value: e.id, label: e.name })),
    },
    { name: "period_year", label: "Year", type: "number", defaultValue: now.getUTCFullYear(), required: true },
    { name: "period_month", label: "Month (1–12)", type: "number", defaultValue: now.getUTCMonth() + 1, required: true },
  ];

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Payroll runs</h1>
          <p className="text-sm text-muted-foreground">
            Draft → Calculated → Approved → Paid → Closed. Approved runs are
            frozen at the database level.
          </p>
        </div>
        <OrgFormDialog
          action={createRun}
          fields={createFields}
          submitLabel="Create run"
          title="New payroll run"
          triggerLabel="New run"
        />
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Period</TableHead>
            <TableHead>Entity</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="text-right">Employees</TableHead>
            <TableHead className="text-right">Net total</TableHead>
            <TableHead className="text-right">Variances</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {(runs ?? []).length === 0 && (
            <TableRow>
              <TableCell className="text-muted-foreground" colSpan={6}>
                No payroll runs yet.
              </TableCell>
            </TableRow>
          )}
          {(runs ?? []).map((run) => {
            const totals = run.totals as { net?: number; employees?: number } | null;
            const variances = (run.variances as unknown[] | null) ?? [];
            return (
              <TableRow key={run.id}>
                <TableCell className="font-medium">
                  <Link className="hover:underline" href={`/dashboard/payroll/runs/${run.id}`}>
                    {run.period_year}-{String(run.period_month).padStart(2, "0")}
                  </Link>
                </TableCell>
                <TableCell>{(run.legal_entities as { name?: string } | null)?.name ?? "—"}</TableCell>
                <TableCell>
                  <Badge variant={RUN_STATUS_VARIANT[run.status] ?? "outline"}>{run.status}</Badge>
                </TableCell>
                <TableCell className="text-right font-mono text-xs">{totals?.employees ?? "—"}</TableCell>
                <TableCell className="text-right font-mono text-xs">
                  {totals?.net !== undefined ? formatMoney(totals.net) : "—"}
                </TableCell>
                <TableCell className="text-right font-mono text-xs">{variances.length}</TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}

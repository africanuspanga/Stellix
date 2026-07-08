import type { Metadata } from "next";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { formatMoney } from "@/lib/org/queries";
import { calculatePayroll, type PayrollResult } from "@/lib/payroll/engine";
import { getPayrollInputs, getRulesForEntity } from "@/lib/payroll/loader";
import { Alert, AlertDescription } from "@/components/ui/alert";
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

export const metadata: Metadata = { title: "Payroll calculator — Stellix" };

export default async function PayrollCalculatorPage({
  searchParams,
}: {
  searchParams: Promise<{ year?: string; month?: string; employee?: string }>;
}) {
  const params = await searchParams;
  const now = new Date();
  const year = Number(params.year ?? now.getUTCFullYear());
  const month = Number(params.month ?? now.getUTCMonth() + 1);
  const period = { year, month };

  const supabase = await createClient();
  const entityInputs = await getPayrollInputs(supabase, period);

  const results: PayrollResult[] = [];
  let missingPack = false;
  for (const entity of entityInputs) {
    const rules = await getRulesForEntity(supabase, entity.legalEntityId, period);
    if (rules.length === 0) {
      missingPack = true;
      continue;
    }
    for (const employee of entity.employees) {
      results.push(calculatePayroll(employee, period, rules));
    }
  }
  results.sort((a, b) => a.employeeName.localeCompare(b.employeeName));

  const totals = results.reduce(
    (acc, r) => ({
      gross: acc.gross + r.grossPay,
      paye: acc.paye + r.paye,
      net: acc.net + r.netPay,
      employer: acc.employer + r.employerCost,
    }),
    { gross: 0, paye: 0, net: 0, employer: 0 },
  );
  const allWarnings = [...new Set(results.flatMap((r) => r.warnings))];
  const selected = results.find((r) => r.employeeId === params.employee);

  const months = Array.from({ length: 12 }, (_, i) => i + 1);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Payroll calculator</h1>
          <p className="text-sm text-muted-foreground">
            Deterministic gross-to-net preview from effective-dated statutory
            rules — {results.length} employees calculated for {year}-
            {String(month).padStart(2, "0")}.
          </p>
        </div>
        <form className="flex items-center gap-2">
          <select
            className="border-input h-9 rounded-md border bg-transparent px-3 text-sm"
            defaultValue={String(month)}
            name="month"
          >
            {months.map((m) => (
              <option key={m} value={m}>
                {new Date(Date.UTC(2026, m - 1)).toLocaleString("en", { month: "long" })}
              </option>
            ))}
          </select>
          <select
            className="border-input h-9 rounded-md border bg-transparent px-3 text-sm"
            defaultValue={String(year)}
            name="year"
          >
            {[year - 1, year, year + 1].map((y) => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>
          <button
            className="h-9 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground"
            type="submit"
          >
            Calculate
          </button>
        </form>
      </div>

      {missingPack && (
        <Alert variant="destructive">
          <AlertDescription>
            A legal entity has no compliance pack attached — its employees were
            skipped.
          </AlertDescription>
        </Alert>
      )}
      {allWarnings.length > 0 && (
        <Alert>
          <AlertDescription>
            <ul className="list-inside list-disc">
              {allWarnings.slice(0, 6).map((w) => (
                <li key={w}>{w}</li>
              ))}
            </ul>
          </AlertDescription>
        </Alert>
      )}

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {[
          { label: "Total gross", value: totals.gross },
          { label: "Total PAYE", value: totals.paye },
          { label: "Total net pay", value: totals.net },
          { label: "Total employer cost", value: totals.employer },
        ].map((stat) => (
          <Card className="shadow-none" key={stat.label}>
            <CardHeader>
              <CardTitle className="font-mono text-lg">{formatMoney(stat.value)}</CardTitle>
              <p className="text-xs text-muted-foreground">{stat.label}</p>
            </CardHeader>
          </Card>
        ))}
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Employee</TableHead>
            <TableHead className="text-right">Basic</TableHead>
            <TableHead className="text-right">Gross</TableHead>
            <TableHead className="text-right">NSSF (ee)</TableHead>
            <TableHead className="text-right">PAYE</TableHead>
            <TableHead className="text-right">Net pay</TableHead>
            <TableHead className="text-right">Employer cost</TableHead>
            <TableHead className="w-16" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {results.length === 0 && (
            <TableRow>
              <TableCell className="text-muted-foreground" colSpan={8}>
                No employees with compensation records found for this period.
              </TableCell>
            </TableRow>
          )}
          {results.map((r) => (
            <TableRow key={r.employeeId}>
              <TableCell className="font-medium">
                {r.employeeName}
                {r.warnings.some((w) => w.includes("minimum wage")) && (
                  <Badge className="ml-2" variant="destructive">below min wage</Badge>
                )}
              </TableCell>
              <TableCell className="text-right font-mono text-xs">{formatMoney(r.basicSalary)}</TableCell>
              <TableCell className="text-right font-mono text-xs">{formatMoney(r.grossPay)}</TableCell>
              <TableCell className="text-right font-mono text-xs">
                {formatMoney(r.statutoryDeductions.find((d) => d.code === "PENSION_EE")?.amount ?? 0)}
              </TableCell>
              <TableCell className="text-right font-mono text-xs">{formatMoney(r.paye)}</TableCell>
              <TableCell className="text-right font-mono text-xs font-semibold">
                {formatMoney(r.netPay)}
              </TableCell>
              <TableCell className="text-right font-mono text-xs">{formatMoney(r.employerCost)}</TableCell>
              <TableCell>
                <Link
                  className="text-xs underline underline-offset-2 hover:text-foreground"
                  href={`?year=${year}&month=${month}&employee=${r.employeeId}`}
                >
                  Trace
                </Link>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      {selected && (
        <Card className="shadow-none">
          <CardHeader>
            <CardTitle>
              Calculation trace — {selected.employeeName} ·{" "}
              {year}-{String(month).padStart(2, "0")}
            </CardTitle>
            <p className="text-xs text-muted-foreground">
              Every line cites the rule and version applied — the calculation
              is fully reproducible.
            </p>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Step</TableHead>
                  <TableHead>Detail</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead>Rule applied</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {selected.trace.map((line, i) => (
                  <TableRow key={i}>
                    <TableCell className="font-mono text-xs">{line.step}</TableCell>
                    <TableCell className="text-sm">{line.detail}</TableCell>
                    <TableCell className="text-right font-mono text-xs">
                      {formatMoney(line.amount)}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {line.rule ? (
                        <>
                          {line.rule.name} · v{line.rule.version}{" "}
                          <Badge variant={line.rule.status === "approved" ? "default" : "outline"}>
                            {line.rule.status}
                          </Badge>
                        </>
                      ) : (
                        "—"
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { formatMoney } from "@/lib/org/queries";
import { fullName, getEmployees } from "@/lib/people/queries";
import { calculatePayroll, type PayrollResult } from "@/lib/payroll/engine";
import { getPayrollInputs, getRulesForEntity } from "@/lib/payroll/loader";
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

export const metadata: Metadata = { title: "Payroll sandbox — Stellix" };

const inputClass =
  "border-input h-9 w-full rounded-md border bg-transparent px-3 text-sm shadow-xs outline-none focus-visible:ring-2 focus-visible:ring-ring";

function Delta({ current, scenario }: { current: number; scenario: number }) {
  const diff = Math.round((scenario - current) * 100) / 100;
  if (diff === 0) return <span className="text-muted-foreground">±0</span>;
  return (
    <span className={diff > 0 ? "" : "text-destructive"}>
      {diff > 0 ? "+" : ""}
      {formatMoney(diff)}
    </span>
  );
}

export default async function SandboxPage({
  searchParams,
}: {
  searchParams: Promise<{
    employee?: string;
    basic?: string;
    bonus?: string;
    extra_deduction?: string;
  }>;
}) {
  const query = await searchParams;
  const supabase = await createClient();
  const now = new Date();
  const period = { year: now.getUTCFullYear(), month: now.getUTCMonth() + 1 };

  const [employees, entityInputs] = await Promise.all([
    getEmployees(supabase),
    getPayrollInputs(supabase, period),
  ]);

  let current: PayrollResult | null = null;
  let scenario: PayrollResult | null = null;

  if (query.employee) {
    for (const entity of entityInputs) {
      const employee = entity.employees.find((e) => e.employeeId === query.employee);
      if (!employee) continue;
      const rules = await getRulesForEntity(supabase, entity.legalEntityId, period);
      if (rules.length === 0) break;

      current = calculatePayroll(employee, period, rules);

      const scenarioInput = {
        ...employee,
        basicSalary: query.basic ? Number(query.basic) : employee.basicSalary,
        components: [
          ...employee.components,
          ...(query.bonus && Number(query.bonus) > 0
            ? [{
                code: "SANDBOX_BONUS", name: "Scenario bonus",
                componentType: "earning" as const, calcType: "fixed" as const,
                amount: Number(query.bonus), taxable: true, pensionable: false,
              }]
            : []),
          ...(query.extra_deduction && Number(query.extra_deduction) > 0
            ? [{
                code: "SANDBOX_DED", name: "Scenario deduction",
                componentType: "deduction" as const, calcType: "fixed" as const,
                amount: Number(query.extra_deduction), taxable: false, pensionable: false,
              }]
            : []),
        ],
      };
      scenario = calculatePayroll(scenarioInput, period, rules);
      break;
    }
  }

  const rows: Array<{ label: string; key: keyof Pick<PayrollResult, "grossPay" | "taxableIncome" | "paye" | "totalDeductions" | "netPay" | "employerCost"> }> = [
    { label: "Gross pay", key: "grossPay" },
    { label: "Taxable income", key: "taxableIncome" },
    { label: "PAYE", key: "paye" },
    { label: "Total deductions", key: "totalDeductions" },
    { label: "Net pay", key: "netPay" },
    { label: "Employer cost", key: "employerCost" },
  ];

  return (
    <div className="flex flex-col gap-6">
      <div>
        <div className="flex items-center gap-2">
          <h1 className="text-xl font-semibold tracking-tight">Payroll sandbox</h1>
          <Badge variant="outline">never touches live payroll</Badge>
        </div>
        <p className="text-sm text-muted-foreground">
          Model salary changes, bonuses and deductions — computed with the same
          engine and live rules, persisted nowhere.
        </p>
      </div>

      <form className="grid grid-cols-1 gap-3 rounded-xl border p-4 sm:grid-cols-2 lg:grid-cols-5">
        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium" htmlFor="employee">Employee</label>
          <select className={inputClass} defaultValue={query.employee ?? ""} id="employee" name="employee" required>
            <option value="">Choose…</option>
            {employees.map((e) => (
              <option key={e.id} value={e.id}>
                {fullName(e)} ({e.employee_number})
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium" htmlFor="basic">New basic salary (blank = current)</label>
          <input className={inputClass} defaultValue={query.basic ?? ""} id="basic" min="0" name="basic" step="0.01" type="number" />
        </div>
        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium" htmlFor="bonus">One-off bonus</label>
          <input className={inputClass} defaultValue={query.bonus ?? ""} id="bonus" min="0" name="bonus" step="0.01" type="number" />
        </div>
        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium" htmlFor="extra_deduction">Extra deduction</label>
          <input className={inputClass} defaultValue={query.extra_deduction ?? ""} id="extra_deduction" min="0" name="extra_deduction" step="0.01" type="number" />
        </div>
        <div className="flex items-end">
          <button
            className="h-9 w-full rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground"
            type="submit"
          >
            Run scenario
          </button>
        </div>
      </form>

      {current && scenario && (
        <Card className="shadow-none">
          <CardHeader>
            <CardTitle>
              {current.employeeName} — current vs scenario (
              {period.year}-{String(period.month).padStart(2, "0")})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead />
                  <TableHead className="text-right">Current</TableHead>
                  <TableHead className="text-right">Scenario</TableHead>
                  <TableHead className="text-right">Impact</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row) => (
                  <TableRow key={row.key}>
                    <TableCell className="font-medium">{row.label}</TableCell>
                    <TableCell className="text-right font-mono text-xs">
                      {formatMoney(current[row.key])}
                    </TableCell>
                    <TableCell className="text-right font-mono text-xs">
                      {formatMoney(scenario[row.key])}
                    </TableCell>
                    <TableCell className="text-right font-mono text-xs">
                      <Delta current={current[row.key]} scenario={scenario[row.key]} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            {scenario.warnings.filter((w) => !w.includes("DRAFT")).length > 0 && (
              <p className="mt-3 text-xs text-destructive">
                {scenario.warnings.filter((w) => !w.includes("DRAFT")).join(" · ")}
              </p>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

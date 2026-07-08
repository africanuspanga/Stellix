import type { Metadata } from "next";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { formatMoney } from "@/lib/org/queries";
import { fullName, getEmployees } from "@/lib/people/queries";
import {
  assignPayComponent,
  endPayComponentAssignment,
  savePayComponent,
} from "@/app/dashboard/payroll/components/actions";
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

export const metadata: Metadata = { title: "Pay components — Stellix" };

export default async function PayComponentsPage() {
  const supabase = await createClient();
  const [employees, { data: components }, { data: assignments }] = await Promise.all([
    getEmployees(supabase),
    supabase.from("pay_components").select("*").order("code"),
    supabase
      .from("employee_pay_components")
      .select("*, pay_components(code, name), employees(first_name, middle_name, last_name, employee_number)")
      .is("effective_to", null)
      .order("created_at", { ascending: false })
      .limit(200),
  ]);

  const componentFields = (c?: Record<string, unknown>): FieldDef[] => [
    ...(c ? [{ name: "id", type: "hidden" as const, label: "", defaultValue: c.id as string }] : []),
    { name: "name", label: "Name", defaultValue: c?.name as string, required: true, placeholder: "e.g. Housing allowance" },
    { name: "code", label: "Code", defaultValue: c?.code as string, required: true, placeholder: "e.g. HOUSE" },
    {
      name: "component_type", label: "Type", type: "select",
      options: [
        { value: "earning", label: "Earning (allowance, bonus…)" },
        { value: "deduction", label: "Deduction (loan, union…)" },
      ],
      defaultValue: (c?.component_type as string) ?? "earning",
    },
    {
      name: "calc_type", label: "Calculation", type: "select",
      options: [
        { value: "fixed", label: "Fixed amount" },
        { value: "percent_of_basic", label: "% of basic salary" },
      ],
      defaultValue: (c?.calc_type as string) ?? "fixed",
    },
    { name: "default_amount", label: "Default amount (or %)", type: "number", step: "0.01", defaultValue: c?.default_amount as number },
    {
      name: "taxable", label: "Taxable (earnings)", type: "select",
      options: [{ value: "true", label: "Taxable" }, { value: "false", label: "Non-taxable" }],
      defaultValue: String(c?.taxable ?? true),
    },
    {
      name: "pensionable", label: "Pensionable (earnings)", type: "select",
      options: [{ value: "false", label: "No" }, { value: "true", label: "Yes" }],
      defaultValue: String(c?.pensionable ?? false),
    },
    ...(c
      ? [{
          name: "is_active", label: "Status", type: "select" as const,
          options: [{ value: "true", label: "Active" }, { value: "false", label: "Inactive" }],
          defaultValue: String(c.is_active),
        }]
      : []),
  ];

  const assignFields: FieldDef[] = [
    {
      name: "employee_id", label: "Employee", type: "select", required: true,
      options: employees.map((e) => ({ value: e.id, label: `${fullName(e)} (${e.employee_number})` })),
    },
    {
      name: "pay_component_id", label: "Component", type: "select", required: true,
      options: (components ?? []).filter((c) => c.is_active).map((c) => ({
        value: c.id, label: `${c.name} (${c.code})`,
      })),
    },
    { name: "amount", label: "Amount (blank = component default)", type: "number", step: "0.01" },
    { name: "effective_from", label: "Effective from", type: "date", required: true },
  ];

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Pay components</h1>
          <p className="text-sm text-muted-foreground">
            Recurring earnings and deductions. Statutory amounts (PAYE, NSSF,
            SDL, WCF) are computed by the rule engine —{" "}
            <Link className="underline underline-offset-2" href="/dashboard/payroll/calculator">
              open the calculator
            </Link>
            .
          </p>
        </div>
        <div className="flex gap-2">
          <OrgFormDialog
            action={savePayComponent}
            fields={componentFields()}
            submitLabel="Create component"
            title="New pay component"
            triggerLabel="New component"
            triggerVariant="outline"
          />
          <OrgFormDialog
            action={assignPayComponent}
            description="Effective-dated: assigning again from a later date closes the previous assignment."
            fields={assignFields}
            submitLabel="Assign"
            title="Assign component to employee"
            triggerLabel="Assign to employee"
          />
        </div>
      </div>

      <section className="flex flex-col gap-3">
        <h2 className="font-medium">Components ({(components ?? []).length})</h2>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Code</TableHead>
              <TableHead>Name</TableHead>
              <TableHead>Type</TableHead>
              <TableHead className="text-right">Default</TableHead>
              <TableHead>Flags</TableHead>
              <TableHead className="w-16" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {(components ?? []).length === 0 && (
              <TableRow>
                <TableCell className="text-muted-foreground" colSpan={6}>
                  No components yet — e.g. Housing allowance, Transport
                  allowance, Staff loan.
                </TableCell>
              </TableRow>
            )}
            {(components ?? []).map((component) => (
              <TableRow key={component.id}>
                <TableCell className="font-mono text-xs">{component.code}</TableCell>
                <TableCell className="font-medium">{component.name}</TableCell>
                <TableCell>
                  <Badge variant={component.component_type === "earning" ? "secondary" : "outline"}>
                    {component.component_type}
                  </Badge>
                </TableCell>
                <TableCell className="text-right font-mono text-xs">
                  {component.calc_type === "percent_of_basic"
                    ? `${Number(component.default_amount ?? 0)}% of basic`
                    : formatMoney(component.default_amount)}
                </TableCell>
                <TableCell className="flex gap-1">
                  {component.component_type === "earning" && !component.taxable && (
                    <Badge variant="outline">non-taxable</Badge>
                  )}
                  {component.pensionable && <Badge variant="outline">pensionable</Badge>}
                  {!component.is_active && <Badge variant="destructive">inactive</Badge>}
                </TableCell>
                <TableCell>
                  <OrgFormDialog
                    action={savePayComponent}
                    fields={componentFields(component)}
                    title={`Edit ${component.name}`}
                    triggerLabel="Edit"
                    triggerVariant="ghost"
                  />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="font-medium">Active assignments ({(assignments ?? []).length})</h2>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Employee</TableHead>
              <TableHead>Component</TableHead>
              <TableHead className="text-right">Amount</TableHead>
              <TableHead>Since</TableHead>
              <TableHead className="w-16" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {(assignments ?? []).length === 0 && (
              <TableRow>
                <TableCell className="text-muted-foreground" colSpan={5}>
                  No active assignments.
                </TableCell>
              </TableRow>
            )}
            {(assignments ?? []).map((assignment) => {
              const emp = assignment.employees as {
                first_name: string; middle_name: string | null; last_name: string;
              } | null;
              const component = assignment.pay_components as { code: string; name: string } | null;
              return (
                <TableRow key={assignment.id}>
                  <TableCell className="font-medium">{emp ? fullName(emp) : "—"}</TableCell>
                  <TableCell>
                    {component?.name}{" "}
                    <span className="font-mono text-xs text-muted-foreground">{component?.code}</span>
                  </TableCell>
                  <TableCell className="text-right font-mono text-xs">
                    {assignment.amount === null ? "default" : formatMoney(Number(assignment.amount))}
                  </TableCell>
                  <TableCell className="font-mono text-xs">{assignment.effective_from}</TableCell>
                  <TableCell>
                    <OrgFormDialog
                      action={endPayComponentAssignment}
                      fields={[
                        { name: "id", type: "hidden", label: "", defaultValue: assignment.id },
                        { name: "effective_to", label: "Last effective day", type: "date", required: true },
                      ]}
                      submitLabel="End assignment"
                      title="End component assignment"
                      triggerLabel="End"
                      triggerVariant="ghost"
                    />
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

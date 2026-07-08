import type { Metadata } from "next";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import {
  runAccrual,
  runCarryForward,
  saveLeaveType,
  seedTanzaniaLeaveTypes,
} from "@/app/dashboard/time/leave/actions";
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

export const metadata: Metadata = { title: "Leave types — Stellix" };

export default async function LeaveTypesPage() {
  const supabase = await createClient();
  const { data: types } = await supabase.from("leave_types").select("*").order("name");
  const currentYear = new Date().getFullYear();

  const typeFields = (t?: Record<string, unknown>): FieldDef[] => [
    ...(t ? [{ name: "id", type: "hidden" as const, label: "", defaultValue: t.id as string }] : []),
    { name: "name", label: "Name (English)", defaultValue: t?.name as string, required: true },
    { name: "name_sw", label: "Name (Swahili)", defaultValue: t?.name_sw as string },
    { name: "code", label: "Code", defaultValue: t?.code as string, required: true, placeholder: "e.g. ANNUAL" },
    { name: "annual_entitlement_days", label: "Annual entitlement (days)", type: "number", step: "0.5", defaultValue: (t?.annual_entitlement_days as number) ?? 0 },
    {
      name: "accrual_method", label: "Accrual method", type: "select",
      options: [
        { value: "annual_grant", label: "Annual grant (full entitlement at once)" },
        { value: "monthly", label: "Monthly (entitlement ÷ 12)" },
      ],
      defaultValue: (t?.accrual_method as string) ?? "annual_grant",
    },
    { name: "max_carry_forward_days", label: "Max carry-forward (days)", type: "number", step: "0.5", defaultValue: (t?.max_carry_forward_days as number) ?? 0 },
    {
      name: "is_paid", label: "Paid", type: "select",
      options: [{ value: "true", label: "Paid" }, { value: "false", label: "Unpaid" }],
      defaultValue: String(t?.is_paid ?? true),
    },
    {
      name: "allow_negative_balance", label: "Allow negative balance", type: "select",
      options: [{ value: "false", label: "No" }, { value: "true", label: "Yes" }],
      defaultValue: String(t?.allow_negative_balance ?? false),
    },
    {
      name: "requires_document", label: "Requires supporting document", type: "select",
      options: [{ value: "false", label: "No" }, { value: "true", label: "Yes" }],
      defaultValue: String(t?.requires_document ?? false),
    },
    {
      name: "gender_restriction", label: "Gender restriction", type: "select",
      emptyOption: "None",
      options: [{ value: "female", label: "Female only" }, { value: "male", label: "Male only" }],
      defaultValue: (t?.gender_restriction as string) ?? "",
    },
    ...(t
      ? [{
          name: "is_active", label: "Status", type: "select" as const,
          options: [{ value: "true", label: "Active" }, { value: "false", label: "Inactive" }],
          defaultValue: String(t.is_active),
        }]
      : []),
  ];

  const accrualFields = (typeId: string, monthly: boolean): FieldDef[] => [
    { name: "leave_type_id", type: "hidden", label: "", defaultValue: typeId },
    { name: "year", label: "Year", type: "number", defaultValue: currentYear, required: true },
    ...(monthly
      ? [{ name: "month", label: "Month (1–12)", type: "number" as const, defaultValue: new Date().getMonth() + 1, required: true }]
      : []),
  ];

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Leave types</h1>
          <p className="text-sm text-muted-foreground">
            Policies, entitlements, accrual and carry-forward ·{" "}
            <Link className="underline underline-offset-2" href="/dashboard/time/leave">
              back to leave
            </Link>
          </p>
        </div>
        <div className="flex gap-2">
          <OrgFormDialog
            action={seedTanzaniaLeaveTypes}
            description="Adds Annual (28), Sick (126), Maternity (84), Paternity (3), Compassionate (4) and Unpaid. Verify entitlements against current law before use."
            fields={[]}
            submitLabel="Seed defaults"
            title="Seed Tanzania standard leave types"
            triggerLabel="Seed TZ defaults"
            triggerVariant="outline"
          />
          <OrgFormDialog
            action={saveLeaveType}
            fields={typeFields()}
            submitLabel="Create leave type"
            title="New leave type"
            triggerLabel="New type"
          />
        </div>
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Code</TableHead>
            <TableHead>Name</TableHead>
            <TableHead className="text-right">Entitlement</TableHead>
            <TableHead>Accrual</TableHead>
            <TableHead className="text-right">Carry-fwd cap</TableHead>
            <TableHead>Flags</TableHead>
            <TableHead className="w-64" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {(types ?? []).length === 0 && (
            <TableRow>
              <TableCell className="text-muted-foreground" colSpan={7}>
                No leave types yet — seed the Tanzania defaults or create one.
              </TableCell>
            </TableRow>
          )}
          {(types ?? []).map((type) => (
            <TableRow key={type.id}>
              <TableCell className="font-mono text-xs">{type.code}</TableCell>
              <TableCell className="font-medium">
                {type.name}
                {type.name_sw && (
                  <span className="block text-xs text-muted-foreground">{type.name_sw}</span>
                )}
              </TableCell>
              <TableCell className="text-right font-mono text-xs">
                {Number(type.annual_entitlement_days)}d
              </TableCell>
              <TableCell className="text-xs">{type.accrual_method.replace(/_/g, " ")}</TableCell>
              <TableCell className="text-right font-mono text-xs">
                {Number(type.max_carry_forward_days)}d
              </TableCell>
              <TableCell className="flex flex-wrap gap-1">
                {!type.is_paid && <Badge variant="outline">unpaid</Badge>}
                {type.requires_document && <Badge variant="outline">doc</Badge>}
                {type.gender_restriction && (
                  <Badge variant="outline">{type.gender_restriction}</Badge>
                )}
                {type.allow_negative_balance && <Badge variant="outline">negative ok</Badge>}
                {!type.is_active && <Badge variant="destructive">inactive</Badge>}
              </TableCell>
              <TableCell>
                <div className="flex flex-wrap gap-1">
                  <OrgFormDialog
                    action={runAccrual}
                    description="Writes an accrual credit into the ledger for every eligible employee. Already-granted employees are skipped."
                    fields={accrualFields(type.id, type.accrual_method === "monthly")}
                    submitLabel="Run accrual"
                    title={`Run accrual — ${type.name}`}
                    triggerLabel="Accrue"
                    triggerVariant="outline"
                  />
                  <OrgFormDialog
                    action={runCarryForward}
                    description="Expires ledger balance above the carry-forward cap as of 1 January of the following year."
                    fields={[
                      { name: "leave_type_id", type: "hidden", label: "", defaultValue: type.id },
                      { name: "from_year", label: "Carry forward FROM year", type: "number", defaultValue: currentYear - 1, required: true },
                    ]}
                    submitLabel="Run carry-forward"
                    title={`Carry-forward — ${type.name}`}
                    triggerLabel="Carry-fwd"
                    triggerVariant="outline"
                  />
                  <OrgFormDialog
                    action={saveLeaveType}
                    fields={typeFields(type)}
                    title={`Edit ${type.name}`}
                    triggerLabel="Edit"
                    triggerVariant="ghost"
                  />
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

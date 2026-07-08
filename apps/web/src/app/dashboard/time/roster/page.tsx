import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { fullName, getEmployees } from "@/lib/people/queries";
import { assignRoster, saveShift } from "@/app/dashboard/time/attendance/actions";
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

export const metadata: Metadata = { title: "Shifts & roster — Stellix" };

export default async function RosterPage() {
  const supabase = await createClient();
  const today = new Date().toISOString().slice(0, 10);
  const [employees, { data: shifts }, { data: sites }, { data: roster }] = await Promise.all([
    getEmployees(supabase),
    supabase.from("shifts").select("*").order("start_time"),
    supabase.from("work_sites").select("id, name").eq("is_active", true),
    supabase
      .from("roster_assignments")
      .select("*, shifts(name, code, start_time, end_time), employees(first_name, middle_name, last_name, employee_number)")
      .gte("work_date", today)
      .order("work_date")
      .limit(150),
  ]);

  const shiftFields = (s?: Record<string, unknown>): FieldDef[] => [
    ...(s ? [{ name: "id", type: "hidden" as const, label: "", defaultValue: s.id as string }] : []),
    { name: "name", label: "Shift name", defaultValue: s?.name as string, required: true, placeholder: "e.g. Day shift" },
    { name: "code", label: "Code", defaultValue: s?.code as string, required: true, placeholder: "e.g. DAY" },
    { name: "start_time", label: "Start (HH:MM)", defaultValue: (s?.start_time as string)?.slice(0, 5) ?? "08:00", required: true, placeholder: "08:00" },
    { name: "end_time", label: "End (HH:MM — earlier than start = crosses midnight)", defaultValue: (s?.end_time as string)?.slice(0, 5) ?? "17:00", required: true, placeholder: "17:00" },
    { name: "grace_minutes", label: "Grace period (minutes)", type: "number", defaultValue: (s?.grace_minutes as number) ?? 15 },
    { name: "unpaid_break_minutes", label: "Unpaid break (minutes)", type: "number", defaultValue: (s?.unpaid_break_minutes as number) ?? 60 },
    { name: "required_hours", label: "Required hours", type: "number", step: "0.25", defaultValue: (s?.required_hours as number) ?? 8 },
    {
      name: "is_night", label: "Night shift", type: "select",
      options: [{ value: "false", label: "No" }, { value: "true", label: "Yes" }],
      defaultValue: String(s?.is_night ?? false),
    },
    {
      name: "overtime_eligible", label: "Overtime eligible", type: "select",
      options: [{ value: "true", label: "Yes" }, { value: "false", label: "No" }],
      defaultValue: String(s?.overtime_eligible ?? true),
    },
    ...(s
      ? [{
          name: "is_active", label: "Status", type: "select" as const,
          options: [{ value: "true", label: "Active" }, { value: "false", label: "Inactive" }],
          defaultValue: String(s.is_active),
        }]
      : []),
  ];

  const assignFields: FieldDef[] = [
    {
      name: "employee_id", label: "Employee", type: "select", required: true,
      options: employees.map((e) => ({ value: e.id, label: `${fullName(e)} (${e.employee_number})` })),
    },
    {
      name: "shift_id", label: "Shift", type: "select", required: true,
      options: (shifts ?? []).filter((s) => s.is_active).map((s) => ({
        value: s.id, label: `${s.name} (${String(s.start_time).slice(0, 5)}–${String(s.end_time).slice(0, 5)})`,
      })),
    },
    { name: "start_date", label: "From", type: "date", required: true },
    { name: "end_date", label: "To", type: "date", required: true },
    {
      name: "skip_weekends", label: "Weekends", type: "select",
      options: [
        { value: "true", label: "Skip Saturdays & Sundays" },
        { value: "false", label: "Include weekends" },
      ],
      defaultValue: "true",
    },
    {
      name: "work_site_id", label: "Work site", type: "select", emptyOption: "None",
      options: (sites ?? []).map((s) => ({ value: s.id, label: s.name })),
    },
  ];

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Shifts &amp; roster</h1>
          <p className="text-sm text-muted-foreground">
            Define shifts, then assign employees over date ranges
          </p>
        </div>
        <div className="flex gap-2">
          <OrgFormDialog
            action={saveShift}
            fields={shiftFields()}
            submitLabel="Create shift"
            title="New shift"
            triggerLabel="New shift"
            triggerVariant="outline"
          />
          <OrgFormDialog
            action={assignRoster}
            description="Assigns the shift for each date in the range (existing assignments on those dates are replaced)."
            fields={assignFields}
            submitLabel="Assign roster"
            title="Bulk roster assignment"
            triggerLabel="Assign roster"
          />
        </div>
      </div>

      <section className="flex flex-col gap-3">
        <h2 className="font-medium">Shifts ({(shifts ?? []).length})</h2>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Code</TableHead>
              <TableHead>Name</TableHead>
              <TableHead>Hours</TableHead>
              <TableHead className="text-right">Grace</TableHead>
              <TableHead className="text-right">Break</TableHead>
              <TableHead>Flags</TableHead>
              <TableHead className="w-16" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {(shifts ?? []).length === 0 && (
              <TableRow>
                <TableCell className="text-muted-foreground" colSpan={7}>
                  No shifts yet — create your first shift.
                </TableCell>
              </TableRow>
            )}
            {(shifts ?? []).map((shift) => (
              <TableRow key={shift.id}>
                <TableCell className="font-mono text-xs">{shift.code}</TableCell>
                <TableCell className="font-medium">{shift.name}</TableCell>
                <TableCell className="font-mono text-xs">
                  {String(shift.start_time).slice(0, 5)}–{String(shift.end_time).slice(0, 5)}
                  {" · "}
                  {Number(shift.required_hours)}h
                </TableCell>
                <TableCell className="text-right font-mono text-xs">{shift.grace_minutes}m</TableCell>
                <TableCell className="text-right font-mono text-xs">{shift.unpaid_break_minutes}m</TableCell>
                <TableCell className="flex gap-1">
                  {shift.is_night && <Badge variant="outline">night</Badge>}
                  {!shift.overtime_eligible && <Badge variant="outline">no OT</Badge>}
                  {!shift.is_active && <Badge variant="destructive">inactive</Badge>}
                </TableCell>
                <TableCell>
                  <OrgFormDialog
                    action={saveShift}
                    fields={shiftFields(shift)}
                    title={`Edit ${shift.name}`}
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
        <h2 className="font-medium">Upcoming roster</h2>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Date</TableHead>
              <TableHead>Employee</TableHead>
              <TableHead>Shift</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {(roster ?? []).length === 0 && (
              <TableRow>
                <TableCell className="text-muted-foreground" colSpan={3}>
                  Nothing rostered from today onwards.
                </TableCell>
              </TableRow>
            )}
            {(roster ?? []).map((r) => {
              const emp = r.employees as {
                first_name: string; middle_name: string | null; last_name: string; employee_number: string;
              } | null;
              const shift = r.shifts as { name: string; start_time: string; end_time: string } | null;
              return (
                <TableRow key={r.id}>
                  <TableCell className="font-mono text-xs">{r.work_date}</TableCell>
                  <TableCell className="font-medium">{emp ? fullName(emp) : "—"}</TableCell>
                  <TableCell>
                    {shift
                      ? `${shift.name} (${String(shift.start_time).slice(0, 5)}–${String(shift.end_time).slice(0, 5)})`
                      : "—"}
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

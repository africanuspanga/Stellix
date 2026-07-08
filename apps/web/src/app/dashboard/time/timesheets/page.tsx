import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { fullName, getEmployees } from "@/lib/people/queries";
import { decideTimesheet, saveTimesheetEntry } from "@/app/dashboard/time/attendance/actions";
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

export const metadata: Metadata = { title: "Timesheets — Stellix" };

export default async function TimesheetsPage() {
  const supabase = await createClient();
  const [employees, { data: projects }, { data: entries }] = await Promise.all([
    getEmployees(supabase),
    supabase.from("org_projects").select("id, name").eq("is_active", true).order("name"),
    supabase
      .from("timesheet_entries")
      .select("*, employees(first_name, middle_name, last_name), org_projects(name)")
      .order("work_date", { ascending: false })
      .limit(150),
  ]);

  const entryFields: FieldDef[] = [
    {
      name: "employee_id", label: "Employee", type: "select", required: true,
      options: employees.map((e) => ({ value: e.id, label: `${fullName(e)} (${e.employee_number})` })),
    },
    { name: "work_date", label: "Date", type: "date", required: true },
    {
      name: "project_id", label: "Project", type: "select", emptyOption: "No project",
      options: (projects ?? []).map((p) => ({ value: p.id, label: p.name })),
    },
    { name: "activity", label: "Activity", required: true, placeholder: "e.g. Client site installation" },
    { name: "hours", label: "Hours", type: "number", step: "0.25", required: true },
    {
      name: "billable", label: "Billable", type: "select",
      options: [{ value: "false", label: "Non-billable" }, { value: "true", label: "Billable" }],
      defaultValue: "false",
    },
    { name: "note", label: "Note" },
  ];

  const totalHours = (entries ?? []).reduce((sum, e) => sum + Number(e.hours), 0);
  const billableHours = (entries ?? [])
    .filter((e) => e.billable)
    .reduce((sum, e) => sum + Number(e.hours), 0);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Timesheets</h1>
          <p className="text-sm text-muted-foreground">
            {totalHours}h logged recently · {billableHours}h billable
          </p>
        </div>
        <OrgFormDialog
          action={saveTimesheetEntry}
          fields={entryFields}
          submitLabel="Log time"
          title="New timesheet entry"
          triggerLabel="Log time"
        />
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Date</TableHead>
            <TableHead>Employee</TableHead>
            <TableHead>Project</TableHead>
            <TableHead>Activity</TableHead>
            <TableHead className="text-right">Hours</TableHead>
            <TableHead>Billable</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="w-24" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {(entries ?? []).length === 0 && (
            <TableRow>
              <TableCell className="text-muted-foreground" colSpan={8}>
                No timesheet entries yet.
              </TableCell>
            </TableRow>
          )}
          {(entries ?? []).map((entry) => {
            const emp = entry.employees as {
              first_name: string; middle_name: string | null; last_name: string;
            } | null;
            return (
              <TableRow key={entry.id}>
                <TableCell className="font-mono text-xs">{entry.work_date}</TableCell>
                <TableCell className="font-medium">{emp ? fullName(emp) : "—"}</TableCell>
                <TableCell>{(entry.org_projects as { name?: string } | null)?.name ?? "—"}</TableCell>
                <TableCell className="text-sm">{entry.activity}</TableCell>
                <TableCell className="text-right font-mono text-xs">{Number(entry.hours)}</TableCell>
                <TableCell>{entry.billable ? <Badge variant="outline">billable</Badge> : "—"}</TableCell>
                <TableCell>
                  <Badge
                    variant={
                      entry.status === "approved"
                        ? "default"
                        : entry.status === "rejected"
                          ? "destructive"
                          : "secondary"
                    }
                  >
                    {entry.status}
                  </Badge>
                </TableCell>
                <TableCell>
                  {entry.status === "submitted" && (
                    <OrgFormDialog
                      action={decideTimesheet}
                      fields={[
                        { name: "id", type: "hidden", label: "", defaultValue: entry.id },
                        {
                          name: "decision", label: "Decision", type: "select", required: true,
                          options: [
                            { value: "approved", label: "Approve" },
                            { value: "rejected", label: "Reject" },
                          ],
                        },
                      ]}
                      submitLabel="Submit"
                      title="Approve timesheet entry"
                      triggerLabel="Decide"
                      triggerVariant="outline"
                    />
                  )}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}

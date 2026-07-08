import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { getTenancyContext } from "@/lib/tenancy/context";
import { fullName, getEmployees } from "@/lib/people/queries";
import {
  approveOvertime,
  decideCorrection,
  processAttendance,
  requestCorrection,
} from "@/app/dashboard/time/attendance/actions";
import { CheckInCard } from "@/components/time/check-in-card";
import { OrgFormDialog, type FieldDef } from "@/components/org/org-form-dialog";
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

export const metadata: Metadata = { title: "Attendance — Stellix" };

const STATUS_VARIANT: Record<string, "default" | "secondary" | "outline" | "destructive"> = {
  present: "default",
  late: "secondary",
  half_day: "secondary",
  on_leave: "outline",
  holiday: "outline",
  rest_day: "outline",
  absent: "destructive",
  missing_in: "destructive",
  missing_out: "destructive",
};

function minutesLabel(minutes: number): string {
  if (minutes <= 0) return "—";
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h > 0 ? `${h}h${m > 0 ? ` ${m}m` : ""}` : `${m}m`;
}

export default async function AttendancePage() {
  const supabase = await createClient();
  const context = await getTenancyContext();
  const employees = await getEmployees(supabase);
  const employeeById = new Map(employees.map((e) => [e.id, e]));

  // My linked employee → last event today for the check-in toggle label.
  const { data: myEmployee } = await supabase
    .from("employees")
    .select("id")
    .eq("user_id", context?.user.id ?? "")
    .maybeSingle();
  let lastEventType: string | null = null;
  if (myEmployee) {
    const dayStart = new Date();
    dayStart.setUTCHours(0, 0, 0, 0);
    const { data: lastEvent } = await supabase
      .from("attendance_events")
      .select("event_type")
      .eq("employee_id", myEmployee.id)
      .gte("event_time", dayStart.toISOString())
      .order("event_time", { ascending: false })
      .limit(1)
      .maybeSingle();
    lastEventType = (lastEvent?.event_type as string) ?? null;
  }

  const since = new Date();
  since.setUTCDate(since.getUTCDate() - 14);
  const sinceDate = since.toISOString().slice(0, 10);

  const [{ data: days }, { data: corrections }, { data: recentEvents }] = await Promise.all([
    supabase
      .from("attendance_days")
      .select("*")
      .gte("work_date", sinceDate)
      .order("work_date", { ascending: false })
      .limit(200),
    supabase
      .from("attendance_corrections")
      .select("*")
      .eq("status", "pending")
      .order("created_at"),
    supabase
      .from("attendance_events")
      .select("*")
      .order("event_time", { ascending: false })
      .limit(20),
  ]);

  const overtimePending = (days ?? []).filter(
    (d) => d.overtime_minutes > 0 && d.overtime_approved_minutes === 0,
  );

  const correctionFields: FieldDef[] = [
    {
      name: "employee_id", label: "Employee", type: "select", required: true,
      options: employees.map((e) => ({ value: e.id, label: `${fullName(e)} (${e.employee_number})` })),
    },
    { name: "work_date", label: "Date", type: "date", required: true },
    { name: "corrected_in", label: "Corrected check-in (HH:MM, UTC)", placeholder: "08:00" },
    { name: "corrected_out", label: "Corrected check-out (HH:MM, UTC)", placeholder: "17:00" },
    { name: "reason", label: "Reason", required: true },
  ];

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Attendance</h1>
          <p className="text-sm text-muted-foreground">
            Raw events stay immutable — processed days recalculate from events,
            roster, leave and holidays.
          </p>
        </div>
        <div className="flex gap-2">
          <OrgFormDialog
            action={requestCorrection}
            fields={correctionFields}
            submitLabel="Submit correction"
            title="Request attendance correction"
            triggerLabel="Request correction"
            triggerVariant="outline"
          />
          <OrgFormDialog
            action={processAttendance}
            description="Recalculates every employee's day from raw events, roster, approved leave and holidays."
            fields={[{ name: "work_date", label: "Date to process", type: "date", required: true }]}
            submitLabel="Process day"
            title="Process attendance"
            triggerLabel="Process day"
          />
        </div>
      </div>

      <CheckInCard lastEventType={lastEventType} />

      {(corrections ?? []).length > 0 && (
        <Card className="shadow-none">
          <CardHeader>
            <CardTitle>Pending corrections ({corrections!.length})</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            {corrections!.map((c) => {
              const emp = employeeById.get(c.employee_id as string);
              return (
                <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border px-3 py-2" key={c.id}>
                  <div>
                    <p className="text-sm font-medium">
                      {emp ? fullName(emp) : "—"} · {c.work_date}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {c.corrected_in ? `in ${String(c.corrected_in).slice(11, 16)}` : ""}
                      {c.corrected_out ? ` out ${String(c.corrected_out).slice(11, 16)}` : ""} · {c.reason}
                    </p>
                  </div>
                  <OrgFormDialog
                    action={decideCorrection}
                    fields={[
                      { name: "id", type: "hidden", label: "", defaultValue: c.id },
                      {
                        name: "decision", label: "Decision", type: "select", required: true,
                        options: [
                          { value: "approved", label: "Approve (writes correction events + reprocesses)" },
                          { value: "rejected", label: "Reject" },
                        ],
                      },
                    ]}
                    submitLabel="Submit decision"
                    title="Decide correction"
                    triggerLabel="Decide"
                  />
                </div>
              );
            })}
          </CardContent>
        </Card>
      )}

      {overtimePending.length > 0 && (
        <Card className="shadow-none">
          <CardHeader>
            <CardTitle>Overtime awaiting approval ({overtimePending.length})</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            {overtimePending.map((d) => {
              const emp = employeeById.get(d.employee_id as string);
              return (
                <div className="flex items-center justify-between rounded-md border px-3 py-2" key={d.id}>
                  <p className="text-sm">
                    {emp ? fullName(emp) : "—"} · {d.work_date} · computed{" "}
                    <strong>{minutesLabel(d.overtime_minutes)}</strong>
                  </p>
                  <OrgFormDialog
                    action={approveOvertime}
                    fields={[
                      { name: "id", type: "hidden", label: "", defaultValue: d.id },
                      { name: "approved_minutes", label: `Approved minutes (max ${d.overtime_minutes})`, type: "number", required: true, defaultValue: d.overtime_minutes },
                    ]}
                    submitLabel="Approve overtime"
                    title="Approve overtime"
                    triggerLabel="Approve"
                    triggerVariant="outline"
                  />
                </div>
              );
            })}
          </CardContent>
        </Card>
      )}

      <section className="flex flex-col gap-3">
        <h2 className="font-medium">Processed days (last 14 days)</h2>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Date</TableHead>
              <TableHead>Employee</TableHead>
              <TableHead>In → Out</TableHead>
              <TableHead className="text-right">Worked</TableHead>
              <TableHead className="text-right">Late</TableHead>
              <TableHead className="text-right">OT / approved</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {(days ?? []).length === 0 && (
              <TableRow>
                <TableCell className="text-muted-foreground" colSpan={7}>
                  Nothing processed yet — check in, then run &quot;Process day&quot;.
                </TableCell>
              </TableRow>
            )}
            {(days ?? []).map((d) => {
              const emp = employeeById.get(d.employee_id as string);
              return (
                <TableRow key={d.id}>
                  <TableCell className="font-mono text-xs">{d.work_date}</TableCell>
                  <TableCell className="font-medium">{emp ? fullName(emp) : "—"}</TableCell>
                  <TableCell className="font-mono text-xs">
                    {d.first_in ? String(d.first_in).slice(11, 16) : "—"} →{" "}
                    {d.last_out ? String(d.last_out).slice(11, 16) : "—"}
                  </TableCell>
                  <TableCell className="text-right font-mono text-xs">
                    {minutesLabel(d.worked_minutes)}
                  </TableCell>
                  <TableCell className="text-right font-mono text-xs">
                    {minutesLabel(d.late_minutes)}
                  </TableCell>
                  <TableCell className="text-right font-mono text-xs">
                    {minutesLabel(d.overtime_minutes)}
                    {d.overtime_approved_minutes > 0 && ` / ${minutesLabel(d.overtime_approved_minutes)} ✓`}
                  </TableCell>
                  <TableCell>
                    <Badge variant={STATUS_VARIANT[d.status] ?? "outline"}>
                      {String(d.status).replace(/_/g, " ")}
                    </Badge>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="font-medium">Latest raw events</h2>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Time (UTC)</TableHead>
              <TableHead>Employee</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Method</TableHead>
              <TableHead>Geofence</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {(recentEvents ?? []).map((e) => {
              const emp = employeeById.get(e.employee_id as string);
              return (
                <TableRow key={e.id}>
                  <TableCell className="font-mono text-xs">
                    {String(e.event_time).slice(0, 16).replace("T", " ")}
                  </TableCell>
                  <TableCell>{emp ? fullName(emp) : "—"}</TableCell>
                  <TableCell>{String(e.event_type).replace(/_/g, " ")}</TableCell>
                  <TableCell className="text-xs">{e.method}</TableCell>
                  <TableCell>
                    <Badge
                      variant={
                        e.geofence_result === "inside"
                          ? "default"
                          : e.geofence_result === "outside"
                            ? "destructive"
                            : "outline"
                      }
                    >
                      {String(e.geofence_result).replace(/_/g, " ")}
                    </Badge>
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

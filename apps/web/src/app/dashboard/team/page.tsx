import type { Metadata } from "next";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getTenancyContext } from "@/lib/tenancy/context";
import { daysUntil, fullName } from "@/lib/people/queries";
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

export const metadata: Metadata = { title: "My team — Stellix" };

export default async function TeamPage() {
  const supabase = await createClient();
  const context = await getTenancyContext();
  const { data: me } = await supabase
    .from("employees")
    .select("id, first_name")
    .eq("user_id", context?.user.id ?? "")
    .maybeSingle();

  if (!me) {
    return (
      <div className="rounded-xl border border-dashed p-8">
        <h1 className="mb-2 text-xl font-semibold">My team</h1>
        <p className="text-sm text-muted-foreground">
          No employee record is linked to your account, so no reporting line can
          be resolved.
        </p>
      </div>
    );
  }

  // Direct reports from current effective-dated assignments.
  const { data: reportAssignments } = await supabase
    .from("employee_assignments")
    .select("employee_id, positions(title), departments(name), employees!employee_assignments_employee_id_fkey(id, first_name, middle_name, last_name, employee_number, status)")
    .eq("manager_employee_id", me.id)
    .is("effective_to", null);

  const reports = (reportAssignments ?? [])
    .map((a) => ({
      assignment: a,
      employee: (Array.isArray(a.employees) ? a.employees[0] : a.employees) as {
        id: string; first_name: string; middle_name: string | null; last_name: string;
        employee_number: string; status: string;
      } | null,
    }))
    .filter((r) => r.employee);
  const reportIds = reports.map((r) => r.employee!.id);

  const today = new Date().toISOString().slice(0, 10);
  const weekAgo = new Date();
  weekAgo.setUTCDate(weekAgo.getUTCDate() - 7);

  const [{ data: teamLeave }, { data: teamDays }, { data: contracts }, { data: myRoles }] =
    reportIds.length > 0
      ? await Promise.all([
          supabase
            .from("leave_requests")
            .select("*, leave_types(name), employees(first_name, last_name)")
            .in("employee_id", reportIds)
            .in("status", ["pending", "approved"])
            .gte("end_date", today)
            .order("start_date")
            .limit(20),
          supabase
            .from("attendance_days")
            .select("employee_id, status")
            .in("employee_id", reportIds)
            .gte("work_date", weekAgo.toISOString().slice(0, 10)),
          supabase
            .from("employee_contracts")
            .select("employee_id, ends_on, contract_type")
            .in("employee_id", reportIds)
            .not("ends_on", "is", null)
            .gte("ends_on", today)
            .order("ends_on")
            .limit(10),
          supabase.from("user_roles").select("role_id").eq("user_id", context!.user.id),
        ])
      : [{ data: [] }, { data: [] }, { data: [] }, { data: [] }];

  // Pending approvals assigned to me (direct or via role).
  const roleIds = (myRoles ?? []).map((r) => r.role_id as string);
  const orFilter = [
    `assigned_user_id.eq.${context!.user.id}`,
    ...(roleIds.length > 0 ? [`assigned_role_id.in.(${roleIds.join(",")})`] : []),
  ].join(",");
  const { data: pendingSteps } = await supabase
    .from("workflow_step_actions")
    .select("id")
    .eq("status", "pending")
    .or(orFilter);

  // Attendance summary per report.
  const attendanceByEmployee = new Map<string, { present: number; issues: number }>();
  for (const day of teamDays ?? []) {
    const entry = attendanceByEmployee.get(day.employee_id as string) ?? { present: 0, issues: 0 };
    if (["present", "late"].includes(day.status as string)) entry.present++;
    if (["absent", "missing_in", "missing_out"].includes(day.status as string)) entry.issues++;
    attendanceByEmployee.set(day.employee_id as string, entry);
  }

  const expiring = (contracts ?? []).filter((c) => (daysUntil(c.ends_on as string) ?? 999) <= 60);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">My team</h1>
          <p className="text-sm text-muted-foreground">
            {reports.length} direct reports
          </p>
        </div>
        {(pendingSteps ?? []).length > 0 && (
          <Link href="/dashboard/time/leave">
            <Badge variant="destructive">
              {pendingSteps!.length} approval(s) waiting →
            </Badge>
          </Link>
        )}
      </div>

      {expiring.length > 0 && (
        <Card className="border-destructive/50 shadow-none">
          <CardHeader>
            <CardTitle className="text-destructive">
              Contracts expiring within 60 days ({expiring.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-1.5 text-sm">
            {expiring.map((c, i) => {
              const report = reports.find((r) => r.employee!.id === c.employee_id);
              return (
                <p key={i}>
                  {report ? fullName(report.employee!) : "—"} ·{" "}
                  {String(c.contract_type).replace(/_/g, " ")} ends {c.ends_on as string} (
                  {daysUntil(c.ends_on as string)}d)
                </p>
              );
            })}
          </CardContent>
        </Card>
      )}

      <section className="flex flex-col gap-3">
        <h2 className="font-medium">Direct reports</h2>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Employee</TableHead>
              <TableHead>Position</TableHead>
              <TableHead>Department</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Attendance (7d)</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {reports.length === 0 && (
              <TableRow>
                <TableCell className="text-muted-foreground" colSpan={5}>
                  No direct reports — employees whose current assignment lists
                  you as manager appear here.
                </TableCell>
              </TableRow>
            )}
            {reports.map(({ assignment, employee }) => {
              const attendance = attendanceByEmployee.get(employee!.id);
              return (
                <TableRow key={employee!.id}>
                  <TableCell className="font-medium">
                    <Link className="hover:underline" href={`/dashboard/people/employees/${employee!.id}`}>
                      {fullName(employee!)}
                    </Link>{" "}
                    <span className="font-mono text-xs text-muted-foreground">
                      {employee!.employee_number}
                    </span>
                  </TableCell>
                  <TableCell>{(assignment.positions as { title?: string } | null)?.title ?? "—"}</TableCell>
                  <TableCell>{(assignment.departments as { name?: string } | null)?.name ?? "—"}</TableCell>
                  <TableCell>
                    <Badge variant={employee!.status === "active" ? "default" : "secondary"}>
                      {employee!.status.replace(/_/g, " ")}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right font-mono text-xs">
                    {attendance
                      ? `${attendance.present} present${attendance.issues > 0 ? ` · ${attendance.issues} issues` : ""}`
                      : "—"}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="font-medium">Team leave (upcoming)</h2>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Employee</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Dates</TableHead>
              <TableHead className="text-right">Days</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {(teamLeave ?? []).length === 0 && (
              <TableRow>
                <TableCell className="text-muted-foreground" colSpan={5}>
                  No upcoming team leave.
                </TableCell>
              </TableRow>
            )}
            {(teamLeave ?? []).map((r) => {
              const emp = r.employees as { first_name?: string; last_name?: string } | null;
              return (
                <TableRow key={r.id}>
                  <TableCell className="font-medium">
                    {emp?.first_name} {emp?.last_name}
                  </TableCell>
                  <TableCell>{(r.leave_types as { name?: string } | null)?.name}</TableCell>
                  <TableCell className="font-mono text-xs">
                    {r.start_date} → {r.end_date}
                  </TableCell>
                  <TableCell className="text-right font-mono text-xs">{r.days}</TableCell>
                  <TableCell>
                    <Badge variant={r.status === "approved" ? "default" : "secondary"}>
                      {r.status}
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

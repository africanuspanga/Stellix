import type { Metadata } from "next";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getTenancyContext } from "@/lib/tenancy/context";
import { formatMoney } from "@/lib/org/queries";
import { fullName } from "@/lib/people/queries";
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

export const metadata: Metadata = { title: "My space — Stellix" };

function Info({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-sm">{value ?? "—"}</p>
    </div>
  );
}

export default async function MySpacePage() {
  const supabase = await createClient();
  const context = await getTenancyContext();
  const { data: me } = await supabase
    .from("employees")
    .select("*")
    .eq("user_id", context?.user.id ?? "")
    .maybeSingle();

  if (!me) {
    return (
      <div className="rounded-xl border border-dashed p-8">
        <h1 className="mb-2 text-xl font-semibold">My space</h1>
        <p className="text-sm text-muted-foreground">
          No employee record is linked to your account yet. Ask HR to set your
          work email on your employee profile — self-service unlocks
          automatically.
        </p>
      </div>
    );
  }

  const today = new Date().toISOString().slice(0, 10);
  const [
    { data: assignment },
    { data: compensation },
    { data: balances },
    { data: leaveTypes },
    { data: myRequests },
    { data: payslips },
    { data: roster },
    { data: myDays },
  ] = await Promise.all([
    supabase
      .from("employee_assignments")
      .select("positions(title), departments(name), branches(name)")
      .eq("employee_id", me.id)
      .is("effective_to", null)
      .maybeSingle(),
    supabase
      .from("employee_compensation")
      .select("basic_salary, currency")
      .eq("employee_id", me.id)
      .is("effective_to", null)
      .maybeSingle(),
    supabase.from("leave_balances").select("leave_type_id, balance_days").eq("employee_id", me.id),
    supabase.from("leave_types").select("id, name"),
    supabase
      .from("leave_requests")
      .select("*, leave_types(name)")
      .eq("employee_id", me.id)
      .order("created_at", { ascending: false })
      .limit(5),
    supabase
      .from("payroll_run_lines")
      .select("run_id, net_pay, gross_pay")
      .eq("employee_id", me.id)
      .order("created_at", { ascending: false })
      .limit(6),
    supabase
      .from("roster_assignments")
      .select("work_date, shifts(name, start_time, end_time)")
      .eq("employee_id", me.id)
      .gte("work_date", today)
      .order("work_date")
      .limit(5),
    supabase
      .from("attendance_days")
      .select("work_date, status, worked_minutes")
      .eq("employee_id", me.id)
      .order("work_date", { ascending: false })
      .limit(7),
  ]);

  const typeById = new Map((leaveTypes ?? []).map((t) => [t.id as string, t.name as string]));
  const { data: runMeta } = await supabase
    .from("payslip_run_meta")
    .select("id, period_year, period_month, status")
    .in("id", (payslips ?? []).map((p) => p.run_id as string));
  const metaById = new Map((runMeta ?? []).map((r) => [r.id as string, r]));
  const finalPayslips = (payslips ?? []).filter((p) => {
    const meta = metaById.get(p.run_id as string);
    return meta && ["approved", "paid", "closed"].includes(meta.status as string);
  });

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">
          Karibu, {me.first_name} 👋
        </h1>
        <p className="font-mono text-xs text-muted-foreground">
          {me.employee_number} · {fullName(me)}
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="shadow-none">
          <CardHeader>
            <CardTitle>My placement</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-2 gap-3">
            <Info
              label="Position"
              value={(assignment?.positions as { title?: string } | null)?.title}
            />
            <Info
              label="Department"
              value={(assignment?.departments as { name?: string } | null)?.name}
            />
            <Info
              label="Branch"
              value={(assignment?.branches as { name?: string } | null)?.name}
            />
            <Info
              label="Basic salary"
              value={
                compensation
                  ? formatMoney(Number(compensation.basic_salary), compensation.currency)
                  : undefined
              }
            />
          </CardContent>
        </Card>

        <Card className="shadow-none">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>Leave balances</CardTitle>
            <Link className="text-xs underline underline-offset-2" href="/dashboard/time/leave">
              request leave →
            </Link>
          </CardHeader>
          <CardContent className="flex flex-col gap-1.5">
            {(balances ?? []).length === 0 && (
              <p className="text-sm text-muted-foreground">No balances yet.</p>
            )}
            {(balances ?? []).map((b) => (
              <div className="flex justify-between text-sm" key={b.leave_type_id as string}>
                <span>{typeById.get(b.leave_type_id as string) ?? "—"}</span>
                <span className="font-mono">{Number(b.balance_days)}d</span>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card className="shadow-none">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>Upcoming shifts</CardTitle>
            <Link className="text-xs underline underline-offset-2" href="/dashboard/time/attendance">
              check in →
            </Link>
          </CardHeader>
          <CardContent className="flex flex-col gap-1.5">
            {(roster ?? []).length === 0 && (
              <p className="text-sm text-muted-foreground">Nothing rostered.</p>
            )}
            {(roster ?? []).map((r, i) => {
              const shift = r.shifts as { name?: string; start_time?: string; end_time?: string } | null;
              return (
                <div className="flex justify-between text-sm" key={i}>
                  <span className="font-mono text-xs">{r.work_date as string}</span>
                  <span>
                    {shift?.name} {String(shift?.start_time).slice(0, 5)}–
                    {String(shift?.end_time).slice(0, 5)}
                  </span>
                </div>
              );
            })}
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card className="shadow-none">
          <CardHeader>
            <CardTitle>My payslips</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Period</TableHead>
                  <TableHead className="text-right">Net pay</TableHead>
                  <TableHead className="w-20" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {finalPayslips.length === 0 && (
                  <TableRow>
                    <TableCell className="text-muted-foreground" colSpan={3}>
                      No approved payslips yet.
                    </TableCell>
                  </TableRow>
                )}
                {finalPayslips.map((p) => {
                  const meta = metaById.get(p.run_id as string)!;
                  return (
                    <TableRow key={p.run_id as string}>
                      <TableCell className="font-mono text-xs">
                        {meta.period_year}-{String(meta.period_month).padStart(2, "0")}
                      </TableCell>
                      <TableCell className="text-right font-mono text-xs font-semibold">
                        {formatMoney(Number(p.net_pay))}
                      </TableCell>
                      <TableCell>
                        <Link
                          className="text-xs underline underline-offset-2"
                          href={`/dashboard/payroll/runs/${p.run_id}/payslip/${me.id}`}
                        >
                          View
                        </Link>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card className="shadow-none">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>My leave requests</CardTitle>
            <Link
              className="text-xs underline underline-offset-2"
              href="/dashboard/experience/service-desk"
            >
              need help? HR service desk →
            </Link>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Type</TableHead>
                  <TableHead>Dates</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(myRequests ?? []).length === 0 && (
                  <TableRow>
                    <TableCell className="text-muted-foreground" colSpan={3}>
                      No leave requests yet.
                    </TableCell>
                  </TableRow>
                )}
                {(myRequests ?? []).map((r) => (
                  <TableRow key={r.id}>
                    <TableCell>{(r.leave_types as { name?: string } | null)?.name}</TableCell>
                    <TableCell className="font-mono text-xs">
                      {r.start_date} → {r.end_date}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={
                          r.status === "approved"
                            ? "default"
                            : r.status === "rejected"
                              ? "destructive"
                              : "secondary"
                        }
                      >
                        {r.status}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>

      <Card className="shadow-none">
        <CardHeader>
          <CardTitle>My attendance (last 7 processed days)</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          {(myDays ?? []).length === 0 && (
            <p className="text-sm text-muted-foreground">Nothing processed yet.</p>
          )}
          {(myDays ?? []).map((d) => (
            <div className="rounded-lg border px-3 py-2 text-center" key={d.work_date as string}>
              <p className="font-mono text-[10px] text-muted-foreground">{d.work_date as string}</p>
              <Badge variant={d.status === "present" ? "default" : "outline"}>
                {String(d.status).replace(/_/g, " ")}
              </Badge>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

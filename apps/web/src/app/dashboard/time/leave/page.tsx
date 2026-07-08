import type { Metadata } from "next";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getTenancyContext } from "@/lib/tenancy/context";
import { fullName, getEmployees } from "@/lib/people/queries";
import {
  cancelLeaveRequest,
  decideLeaveStep,
  delegateLeaveStep,
  requestLeave,
} from "@/app/dashboard/time/leave/actions";
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

export const metadata: Metadata = { title: "Leave — Stellix" };

const STATUS_VARIANT: Record<string, "default" | "secondary" | "outline" | "destructive"> = {
  approved: "default",
  pending: "secondary",
  cancelled: "outline",
  rejected: "destructive",
};

export default async function LeavePage() {
  const supabase = await createClient();
  const context = await getTenancyContext();
  const userId = context?.user.id ?? "";

  const [employees, { data: leaveTypes }, { data: requests }, { data: myRoles }] =
    await Promise.all([
      getEmployees(supabase),
      supabase.from("leave_types").select("*").eq("is_active", true).order("name"),
      supabase
        .from("leave_requests")
        .select(
          "*, employees(first_name, middle_name, last_name, employee_number), leave_types(name, code)",
        )
        .order("created_at", { ascending: false })
        .limit(100),
      supabase.from("user_roles").select("role_id").eq("user_id", userId),
    ]);

  // Approvals I can act on: assigned to me directly, or to a role I hold.
  const roleIds = (myRoles ?? []).map((r) => r.role_id as string);
  const orFilter = [
    `assigned_user_id.eq.${userId}`,
    ...(roleIds.length > 0 ? [`assigned_role_id.in.(${roleIds.join(",")})`] : []),
  ].join(",");
  const { data: pendingSteps } = await supabase
    .from("workflow_step_actions")
    .select("*, workflow_instances!inner(entity_type, entity_id, status)")
    .eq("status", "pending")
    .or(orFilter);

  const leaveSteps = (pendingSteps ?? []).filter(
    (s) =>
      (s.workflow_instances as { entity_type: string }).entity_type === "leave_request",
  );
  const requestById = new Map((requests ?? []).map((r) => [r.id as string, r]));

  const { data: balances } = await supabase
    .from("leave_balances")
    .select("employee_id, leave_type_id, balance_days")
    .limit(500);
  const employeeById = new Map(employees.map((e) => [e.id, e]));
  const typeById = new Map((leaveTypes ?? []).map((t) => [t.id as string, t]));

  // Delegation targets must be users, not employees — only staff with linked
  // portal accounts qualify.
  const { data: linkedEmployees } = await supabase
    .from("employees")
    .select("first_name, middle_name, last_name, user_id")
    .not("user_id", "is", null);
  const delegateOptions = (linkedEmployees ?? []).map((e) => ({
    value: e.user_id as string,
    label: fullName(e as { first_name: string; middle_name: string | null; last_name: string }),
  }));

  const requestFields: FieldDef[] = [
    {
      name: "employee_id", label: "Employee", type: "select", required: true,
      options: employees.map((e) => ({ value: e.id, label: `${fullName(e)} (${e.employee_number})` })),
    },
    {
      name: "leave_type_id", label: "Leave type", type: "select", required: true,
      options: (leaveTypes ?? []).map((t) => ({ value: t.id, label: `${t.name} (${t.code})` })),
    },
    { name: "start_date", label: "First day", type: "date", required: true },
    { name: "end_date", label: "Last day", type: "date", required: true },
    {
      name: "is_half_day", label: "Half day (single-day requests)", type: "select",
      options: [{ value: "false", label: "No — full days" }, { value: "true", label: "Yes — half day" }],
      defaultValue: "false",
    },
    { name: "reason", label: "Reason" },
  ];

  const decideFields = (stepId: string, requestId: string): FieldDef[] => [
    { name: "step_action_id", type: "hidden", label: "", defaultValue: stepId },
    { name: "request_id", type: "hidden", label: "", defaultValue: requestId },
    {
      name: "decision", label: "Decision", type: "select", required: true,
      options: [
        { value: "approved", label: "Approve" },
        { value: "rejected", label: "Reject" },
      ],
    },
    { name: "comment", label: "Comment" },
  ];

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Leave</h1>
          <p className="text-sm text-muted-foreground">
            Requests, approvals and the leave ledger ·{" "}
            <Link className="underline underline-offset-2" href="/dashboard/time/leave/types">
              leave types & accrual
            </Link>{" "}
            ·{" "}
            <Link className="underline underline-offset-2" href="/dashboard/time/holidays">
              holiday calendar
            </Link>
          </p>
        </div>
        <OrgFormDialog
          action={requestLeave}
          description="Days are counted excluding weekends and public holidays. Balance is checked against the ledger."
          fields={requestFields}
          submitLabel="Submit request"
          title="Request leave"
          triggerLabel="Request leave"
        />
      </div>

      {leaveSteps.length > 0 && (
        <Card className="shadow-none">
          <CardHeader>
            <CardTitle>Waiting for your approval ({leaveSteps.length})</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            {leaveSteps.map((step) => {
              const instance = step.workflow_instances as { entity_id: string };
              const request = requestById.get(instance.entity_id);
              if (!request) return null;
              const emp = request.employees as {
                first_name: string; middle_name: string | null; last_name: string;
              } | null;
              const type = request.leave_types as { name: string } | null;
              const overdue =
                step.sla_hours &&
                Date.now() - new Date(step.created_at as string).getTime() >
                  (step.sla_hours as number) * 3_600_000;
              return (
                <div
                  className="flex flex-wrap items-center justify-between gap-2 rounded-md border px-3 py-2"
                  key={step.id as string}
                >
                  <div>
                    <p className="text-sm font-medium">
                      {emp ? fullName(emp) : "—"} · {type?.name} ·{" "}
                      {request.start_date} → {request.end_date} ({request.days}d)
                      {overdue && <Badge className="ml-2" variant="destructive">overdue</Badge>}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Step {step.step_order as number} · {request.reason ?? "no reason given"}
                    </p>
                  </div>
                  <div className="flex gap-1">
                    <OrgFormDialog
                      action={decideLeaveStep}
                      fields={decideFields(step.id as string, request.id as string)}
                      submitLabel="Submit decision"
                      title="Approve or reject"
                      triggerLabel="Decide"
                    />
                    <OrgFormDialog
                      action={delegateLeaveStep}
                      fields={[
                        { name: "step_action_id", type: "hidden", label: "", defaultValue: step.id as string },
                        {
                          name: "to_user_id", label: "Delegate to (employee with portal access)",
                          type: "select", required: true, options: delegateOptions,
                        },
                        { name: "comment", label: "Comment" },
                      ]}
                      submitLabel="Delegate"
                      title="Delegate this approval"
                      triggerLabel="Delegate"
                      triggerVariant="outline"
                    />
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>
      )}

      <section className="flex flex-col gap-3">
        <h2 className="font-medium">Requests</h2>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Employee</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Dates</TableHead>
              <TableHead className="text-right">Days</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="w-24" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {(requests ?? []).length === 0 && (
              <TableRow>
                <TableCell className="text-muted-foreground" colSpan={6}>
                  No leave requests yet.
                </TableCell>
              </TableRow>
            )}
            {(requests ?? []).map((request) => {
              const emp = request.employees as {
                first_name: string; middle_name: string | null; last_name: string;
              } | null;
              const type = request.leave_types as { name: string; code: string } | null;
              return (
                <TableRow key={request.id}>
                  <TableCell className="font-medium">{emp ? fullName(emp) : "—"}</TableCell>
                  <TableCell>{type?.name ?? "—"}</TableCell>
                  <TableCell className="font-mono text-xs">
                    {request.start_date} → {request.end_date}
                  </TableCell>
                  <TableCell className="text-right font-mono text-xs">{request.days}</TableCell>
                  <TableCell>
                    <Badge variant={STATUS_VARIANT[request.status] ?? "outline"}>
                      {request.status}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {["pending", "approved"].includes(request.status as string) && (
                      <OrgFormDialog
                        action={cancelLeaveRequest}
                        description={
                          request.status === "approved"
                            ? "Cancelling approved leave writes a compensating credit back to the ledger."
                            : undefined
                        }
                        fields={[
                          { name: "request_id", type: "hidden", label: "", defaultValue: request.id as string },
                        ]}
                        submitLabel="Cancel request"
                        title="Cancel leave request"
                        triggerLabel="Cancel"
                        triggerVariant="ghost"
                      />
                    )}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="font-medium">Balances (from the ledger)</h2>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Employee</TableHead>
              <TableHead>Leave type</TableHead>
              <TableHead className="text-right">Balance (days)</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {(balances ?? []).length === 0 && (
              <TableRow>
                <TableCell className="text-muted-foreground" colSpan={3}>
                  No ledger entries yet. Run an accrual from{" "}
                  <Link className="underline" href="/dashboard/time/leave/types">
                    leave types
                  </Link>{" "}
                  to grant entitlements.
                </TableCell>
              </TableRow>
            )}
            {(balances ?? []).map((balance) => {
              const emp = employeeById.get(balance.employee_id as string);
              const type = typeById.get(balance.leave_type_id as string);
              if (!emp || !type) return null;
              return (
                <TableRow key={`${balance.employee_id}-${balance.leave_type_id}`}>
                  <TableCell>{fullName(emp)}</TableCell>
                  <TableCell>{type.name as string}</TableCell>
                  <TableCell className="text-right font-mono text-xs">
                    {Number(balance.balance_days)}
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

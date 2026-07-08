import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { fullName, getEmployees } from "@/lib/people/queries";
import { saveCycle, saveGoal, submitReview } from "@/app/dashboard/people/performance/actions";
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

export const metadata: Metadata = { title: "Performance — Stellix" };

const GOAL_STATUS_VARIANT: Record<string, "default" | "secondary" | "outline" | "destructive"> = {
  achieved: "default",
  on_track: "secondary",
  at_risk: "destructive",
  missed: "destructive",
};

export default async function PerformancePage({
  searchParams,
}: {
  searchParams: Promise<{ cycle?: string }>;
}) {
  const { cycle: cycleParam } = await searchParams;
  const supabase = await createClient();
  const [{ data: cycles }, employees] = await Promise.all([
    supabase.from("performance_cycles").select("*").order("starts_on", { ascending: false }),
    getEmployees(supabase),
  ]);
  const activeCycle =
    (cycles ?? []).find((c) => c.id === cycleParam) ??
    (cycles ?? []).find((c) => c.status === "open") ??
    (cycles ?? [])[0];

  const [{ data: goals }, { data: reviews }] = activeCycle
    ? await Promise.all([
        supabase
          .from("performance_goals")
          .select("*")
          .eq("cycle_id", activeCycle.id)
          .order("created_at"),
        supabase
          .from("performance_reviews")
          .select("*")
          .eq("cycle_id", activeCycle.id),
      ])
    : [{ data: [] }, { data: [] }];

  const employeeById = new Map(employees.map((e) => [e.id, e]));
  const employeeOptions = employees.map((e) => ({
    value: e.id,
    label: `${fullName(e)} (${e.employee_number})`,
  }));

  const cycleFields = (c?: Record<string, unknown>): FieldDef[] => [
    ...(c ? [{ name: "id", type: "hidden" as const, label: "", defaultValue: c.id as string }] : []),
    { name: "name", label: "Cycle name", defaultValue: c?.name as string, required: true, placeholder: "e.g. 2026 H2" },
    { name: "starts_on", label: "Starts", type: "date", defaultValue: c?.starts_on as string, required: true },
    { name: "ends_on", label: "Ends", type: "date", defaultValue: c?.ends_on as string, required: true },
    {
      name: "status", label: "Status", type: "select",
      options: [{ value: "open", label: "Open" }, { value: "closed", label: "Closed" }],
      defaultValue: (c?.status as string) ?? "open",
    },
  ];

  const goalFields = (cycleId: string, g?: Record<string, unknown>): FieldDef[] => [
    ...(g ? [{ name: "id", type: "hidden" as const, label: "", defaultValue: g.id as string }] : []),
    { name: "cycle_id", type: "hidden", label: "", defaultValue: cycleId },
    ...(g
      ? [{ name: "employee_id", type: "hidden" as const, label: "", defaultValue: g.employee_id as string }]
      : [{ name: "employee_id", label: "Employee", type: "select" as const, options: employeeOptions, required: true }]),
    { name: "title", label: "Goal", defaultValue: g?.title as string, required: true, placeholder: "e.g. Close monthly payroll by the 3rd" },
    { name: "description", label: "Key results / detail", type: "textarea", defaultValue: g?.description as string },
    { name: "weight", label: "Weight (%)", type: "number", defaultValue: (g?.weight as number) ?? 25 },
    {
      name: "status", label: "Status", type: "select",
      options: ["on_track", "at_risk", "achieved", "missed"].map((s) => ({ value: s, label: s.replace(/_/g, " ") })),
      defaultValue: (g?.status as string) ?? "on_track",
    },
  ];

  const reviewFields = (cycleId: string, employeeId: string, type: "self" | "manager"): FieldDef[] => [
    { name: "cycle_id", type: "hidden", label: "", defaultValue: cycleId },
    { name: "employee_id", type: "hidden", label: "", defaultValue: employeeId },
    { name: "review_type", type: "hidden", label: "", defaultValue: type },
    {
      name: "rating", label: "Rating (1 = needs improvement … 5 = outstanding)", type: "select", required: true,
      options: [1, 2, 3, 4, 5].map((n) => ({ value: String(n), label: String(n) })),
    },
    { name: "strengths", label: "Strengths", type: "textarea" },
    { name: "improvements", label: "Areas to improve", type: "textarea" },
  ];

  // Group goals by employee for display.
  type GoalRow = Record<string, unknown>;
  const goalsByEmployee = new Map<string, GoalRow[]>();
  for (const goal of (goals ?? []) as GoalRow[]) {
    const employeeKey = goal.employee_id as string;
    const list = goalsByEmployee.get(employeeKey) ?? [];
    list.push(goal);
    goalsByEmployee.set(employeeKey, list);
  }
  const reviewFor = (employeeId: string, type: string) =>
    (reviews ?? []).find((r) => r.employee_id === employeeId && r.review_type === type);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Performance</h1>
          <p className="text-sm text-muted-foreground">
            Goals, self reviews and manager reviews per cycle
          </p>
        </div>
        <div className="flex gap-2">
          {activeCycle && (
            <OrgFormDialog
              action={saveGoal}
              fields={goalFields(activeCycle.id)}
              submitLabel="Add goal"
              title={`Add goal — ${activeCycle.name}`}
              triggerLabel="Add goal"
              triggerVariant="outline"
            />
          )}
          <OrgFormDialog
            action={saveCycle}
            fields={cycleFields()}
            submitLabel="Create cycle"
            title="New performance cycle"
            triggerLabel="New cycle"
          />
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {(cycles ?? []).map((cycle) => (
          <a
            className={`rounded-md border px-3 py-1.5 text-sm ${cycle.id === activeCycle?.id ? "bg-foreground text-background" : "hover:bg-muted"}`}
            href={`?cycle=${cycle.id}`}
            key={cycle.id}
          >
            {cycle.name}
            {cycle.status === "closed" && " (closed)"}
          </a>
        ))}
        {(cycles ?? []).length === 0 && (
          <p className="text-sm text-muted-foreground">
            No cycles yet — create one (e.g. &quot;2026 H2&quot;) to start setting goals.
          </p>
        )}
      </div>

      {activeCycle && (
        <div className="flex flex-col gap-4">
          {[...goalsByEmployee.entries()].map(([employeeId, employeeGoals]) => {
            const employee = employeeById.get(employeeId);
            const selfReview = reviewFor(employeeId, "self");
            const managerReview = reviewFor(employeeId, "manager");
            return (
              <Card className="shadow-none" key={employeeId}>
                <CardHeader className="flex flex-row items-center justify-between">
                  <CardTitle>{employee ? fullName(employee) : "—"}</CardTitle>
                  <div className="flex items-center gap-2 text-xs">
                    <span>
                      Self:{" "}
                      {selfReview ? (
                        <Badge variant="secondary">{selfReview.rating}/5</Badge>
                      ) : (
                        <OrgFormDialog
                          action={submitReview}
                          fields={reviewFields(activeCycle.id, employeeId, "self")}
                          submitLabel="Submit self review"
                          title="Self review"
                          triggerLabel="Write"
                          triggerVariant="ghost"
                        />
                      )}
                    </span>
                    <span>
                      Manager:{" "}
                      {managerReview ? (
                        <Badge>{managerReview.rating}/5</Badge>
                      ) : (
                        <OrgFormDialog
                          action={submitReview}
                          fields={reviewFields(activeCycle.id, employeeId, "manager")}
                          submitLabel="Submit manager review"
                          title="Manager review"
                          triggerLabel="Write"
                          triggerVariant="ghost"
                        />
                      )}
                    </span>
                  </div>
                </CardHeader>
                <CardContent>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Goal</TableHead>
                        <TableHead className="text-right">Weight</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="w-16" />
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {employeeGoals.map((goal) => (
                        <TableRow key={goal.id as string}>
                          <TableCell className="font-medium">{goal.title as string}</TableCell>
                          <TableCell className="text-right font-mono text-xs">
                            {goal.weight as number}%
                          </TableCell>
                          <TableCell>
                            <Badge variant={GOAL_STATUS_VARIANT[goal.status as string] ?? "outline"}>
                              {String(goal.status).replace(/_/g, " ")}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <OrgFormDialog
                              action={saveGoal}
                              fields={goalFields(activeCycle.id, goal)}
                              title="Edit goal"
                              triggerLabel="Edit"
                              triggerVariant="ghost"
                            />
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            );
          })}
          {goalsByEmployee.size === 0 && (
            <p className="text-sm text-muted-foreground">
              No goals in this cycle yet.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

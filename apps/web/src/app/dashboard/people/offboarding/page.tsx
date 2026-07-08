import type { Metadata } from "next";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { fullName, getEmployees } from "@/lib/people/queries";
import {
  cancelCase,
  closeCase,
  initiateCase,
} from "@/app/dashboard/people/offboarding/actions";
import { OrgFormDialog, type FieldDef } from "@/components/org/org-form-dialog";
import { OffboardingTaskToggle } from "@/components/people/offboarding-task-toggle";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export const metadata: Metadata = { title: "Offboarding — Stellix" };

const EXIT_TYPES = [
  "resignation", "retirement", "end_of_contract", "redundancy", "dismissal",
  "death", "medical_separation", "mutual_separation", "abandonment", "transfer",
].map((t) => ({ value: t, label: t.replace(/_/g, " ") }));

export default async function OffboardingPage() {
  const supabase = await createClient();
  const [employees, { data: cases }, { data: tasks }] = await Promise.all([
    getEmployees(supabase),
    supabase
      .from("offboarding_cases")
      .select("*, employees(first_name, middle_name, last_name, employee_number)")
      .order("created_at", { ascending: false })
      .limit(50),
    supabase.from("offboarding_tasks").select("*").order("sort_order"),
  ]);

  const tasksByCase = new Map<string, NonNullable<typeof tasks>>();
  for (const task of tasks ?? []) {
    const list = tasksByCase.get(task.case_id) ?? [];
    list.push(task);
    tasksByCase.set(task.case_id, list);
  }

  const initiateFields: FieldDef[] = [
    {
      name: "employee_id", label: "Employee", type: "select", required: true,
      options: employees
        .filter((e) => !["exited", "exiting"].includes(e.status))
        .map((e) => ({ value: e.id, label: `${fullName(e)} (${e.employee_number})` })),
    },
    { name: "exit_type", label: "Exit type", type: "select", options: EXIT_TYPES, required: true },
    { name: "notice_date", label: "Notice date", type: "date", required: true },
    { name: "last_working_day", label: "Last working day", type: "date", required: true },
    { name: "reason", label: "Reason / notes", type: "textarea" },
  ];

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Offboarding</h1>
          <p className="text-sm text-muted-foreground">
            Exit initiated → clearance checklist → close (final payroll, exit
            action, position vacated, history preserved)
          </p>
        </div>
        <OrgFormDialog
          action={initiateCase}
          description="Creates the case with the standard clearance checklist and marks the employee as exiting."
          fields={initiateFields}
          submitLabel="Initiate exit"
          title="Initiate offboarding"
          triggerLabel="Initiate exit"
        />
      </div>

      {(cases ?? []).length === 0 && (
        <p className="text-sm text-muted-foreground">No offboarding cases.</p>
      )}

      {(cases ?? []).map((offboardingCase) => {
        const employee = offboardingCase.employees as {
          first_name: string; middle_name: string | null; last_name: string; employee_number: string;
        } | null;
        const caseTasks = tasksByCase.get(offboardingCase.id) ?? [];
        const openCount = caseTasks.filter((t) => t.status === "pending").length;
        const isOpen = !["closed", "cancelled"].includes(offboardingCase.status as string);
        return (
          <Card className="shadow-none" key={offboardingCase.id}>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle className="flex items-center gap-2">
                  {employee ? fullName(employee) : "—"}
                  <Badge
                    variant={
                      offboardingCase.status === "closed"
                        ? "outline"
                        : offboardingCase.status === "cancelled"
                          ? "destructive"
                          : "secondary"
                    }
                  >
                    {offboardingCase.status}
                  </Badge>
                </CardTitle>
                <p className="text-xs text-muted-foreground">
                  {String(offboardingCase.exit_type).replace(/_/g, " ")} · notice{" "}
                  {offboardingCase.notice_date} · last day {offboardingCase.last_working_day}
                  {offboardingCase.reason ? ` · ${offboardingCase.reason}` : ""}
                </p>
              </div>
              {isOpen && (
                <div className="flex gap-1">
                  <OrgFormDialog
                    action={closeCase}
                    description={
                      openCount > 0
                        ? `${openCount} clearance task(s) still open — closing will be refused until they are done.`
                        : "Effectuates the exit: employee exited, assignment and salary history closed on the last working day, position vacated, exit letter available."
                    }
                    fields={[{ name: "case_id", type: "hidden", label: "", defaultValue: offboardingCase.id }]}
                    submitLabel="Close case"
                    title="Close offboarding case"
                    triggerLabel="Close case"
                  />
                  <OrgFormDialog
                    action={cancelCase}
                    description="Cancels the exit and returns the employee to active."
                    fields={[{ name: "case_id", type: "hidden", label: "", defaultValue: offboardingCase.id }]}
                    submitLabel="Cancel exit"
                    title="Cancel offboarding"
                    triggerLabel="Cancel"
                    triggerVariant="outline"
                  />
                </div>
              )}
            </CardHeader>
            <CardContent className="flex flex-col gap-1.5">
              {caseTasks.map((task) => (
                <div
                  className="flex items-center justify-between rounded-md border px-3 py-1.5"
                  key={task.id}
                >
                  <div>
                    <p className={`text-sm ${task.status !== "pending" ? "text-muted-foreground line-through" : ""}`}>
                      {task.title}
                    </p>
                    <p className="text-xs text-muted-foreground">{task.assignee_role}</p>
                  </div>
                  {isOpen && (
                    <OffboardingTaskToggle
                      completed={task.status === "completed"}
                      taskId={task.id}
                    />
                  )}
                </div>
              ))}
              {offboardingCase.status === "closed" && employee && (
                <Link
                  className="mt-1 text-xs underline underline-offset-2"
                  href={`/dashboard/people/employees/${offboardingCase.employee_id}`}
                >
                  View employee record (exit letter under employment history) →
                </Link>
              )}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

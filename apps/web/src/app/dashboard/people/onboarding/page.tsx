import type { Metadata } from "next";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { fullName, getEmployees } from "@/lib/people/queries";
import {
  assignTemplate,
  saveTemplate,
  saveTemplateTask,
} from "@/app/dashboard/people/onboarding/actions";
import { OrgFormDialog, type FieldDef } from "@/components/org/org-form-dialog";
import { TaskToggle } from "@/components/people/task-toggle";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export const metadata: Metadata = { title: "Onboarding — Stellix" };

const ASSIGNEE_ROLES = [
  "employee", "hr", "manager", "payroll", "it", "finance", "security", "facilities", "safety",
].map((r) => ({ value: r, label: r }));

export default async function OnboardingPage() {
  const supabase = await createClient();
  const [{ data: templates }, { data: templateTasks }, { data: openTasks }, employees] =
    await Promise.all([
      supabase.from("onboarding_templates").select("*").order("name"),
      supabase.from("onboarding_template_tasks").select("*").order("sort_order"),
      supabase
        .from("employee_onboarding_tasks")
        .select("*, employees(id, first_name, middle_name, last_name, employee_number)")
        .order("due_date"),
      getEmployees(supabase),
    ]);

  const tasksByTemplate = new Map<string, typeof templateTasks & object[]>();
  for (const task of templateTasks ?? []) {
    const list = tasksByTemplate.get(task.template_id) ?? [];
    list.push(task);
    tasksByTemplate.set(task.template_id, list);
  }

  const byEmployee = new Map<string, Array<Record<string, unknown>>>();
  for (const task of (openTasks ?? []) as Array<Record<string, unknown>>) {
    const emp = task.employees as { id: string } | null;
    if (!emp) continue;
    const list = byEmployee.get(emp.id) ?? [];
    list.push(task);
    byEmployee.set(emp.id, list);
  }

  const templateFields = (t?: Record<string, unknown>): FieldDef[] => [
    ...(t ? [{ name: "id", type: "hidden" as const, label: "", defaultValue: t.id as string }] : []),
    { name: "name", label: "Template name", defaultValue: t?.name as string, required: true, placeholder: "e.g. Head office staff" },
    { name: "description", label: "Description", defaultValue: t?.description as string },
  ];

  const taskFields = (templateId: string, t?: Record<string, unknown>): FieldDef[] => [
    ...(t ? [{ name: "id", type: "hidden" as const, label: "", defaultValue: t.id as string }] : []),
    { name: "template_id", type: "hidden", label: "", defaultValue: templateId },
    { name: "title", label: "Task", defaultValue: t?.title as string, required: true, placeholder: "e.g. Sign employment contract" },
    { name: "description", label: "Details", defaultValue: t?.description as string },
    { name: "assignee_role", label: "Assigned to", type: "select", options: ASSIGNEE_ROLES, defaultValue: (t?.assignee_role as string) ?? "hr" },
    { name: "due_days_after_start", label: "Due (days after start)", type: "number", defaultValue: (t?.due_days_after_start as number) ?? 0 },
    { name: "sort_order", label: "Order", type: "number", defaultValue: (t?.sort_order as number) ?? 0 },
  ];

  const assignFields: FieldDef[] = [
    {
      name: "employee_id", label: "Employee", type: "select", required: true,
      options: employees.map((e) => ({ value: e.id, label: `${fullName(e)} (${e.employee_number})` })),
    },
    {
      name: "template_id", label: "Template", type: "select", required: true,
      options: (templates ?? []).map((t) => ({ value: t.id, label: t.name })),
    },
  ];

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Onboarding</h1>
          <p className="text-sm text-muted-foreground">
            Reusable checklists assigned to new employees
          </p>
        </div>
        <div className="flex gap-2">
          <OrgFormDialog
            action={saveTemplate}
            fields={templateFields()}
            submitLabel="Create template"
            title="New onboarding template"
            triggerLabel="New template"
            triggerVariant="outline"
          />
          <OrgFormDialog
            action={assignTemplate}
            description="Creates one task per template item, dated from the employee's hire date."
            fields={assignFields}
            submitLabel="Assign"
            title="Assign onboarding to employee"
            triggerLabel="Assign to employee"
          />
        </div>
      </div>

      <section className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {(templates ?? []).length === 0 && (
          <p className="text-sm text-muted-foreground">
            No templates yet. Create one, add its tasks, then assign it to new hires.
          </p>
        )}
        {(templates ?? []).map((template) => {
          const tasks = tasksByTemplate.get(template.id) ?? [];
          return (
            <Card className="shadow-none" key={template.id}>
              <CardHeader className="flex flex-row items-center justify-between">
                <div>
                  <CardTitle>{template.name}</CardTitle>
                  <p className="text-xs text-muted-foreground">
                    {template.description ?? ""} · {tasks.length} tasks
                  </p>
                </div>
                <div className="flex gap-1">
                  <OrgFormDialog
                    action={saveTemplateTask}
                    fields={taskFields(template.id)}
                    submitLabel="Add task"
                    title={`Add task to ${template.name}`}
                    triggerLabel="Add task"
                    triggerVariant="outline"
                  />
                  <OrgFormDialog
                    action={saveTemplate}
                    fields={templateFields(template)}
                    title="Edit template"
                    triggerLabel="Edit"
                    triggerVariant="ghost"
                  />
                </div>
              </CardHeader>
              <CardContent className="flex flex-col gap-1.5">
                {tasks.map((task) => (
                  <div className="flex items-center justify-between rounded-md border px-3 py-1.5" key={task.id}>
                    <div>
                      <p className="text-sm">{task.title}</p>
                      <p className="text-xs text-muted-foreground">
                        {task.assignee_role} · day {task.due_days_after_start}
                      </p>
                    </div>
                    <OrgFormDialog
                      action={saveTemplateTask}
                      fields={taskFields(template.id, task)}
                      title="Edit task"
                      triggerLabel="Edit"
                      triggerVariant="ghost"
                    />
                  </div>
                ))}
              </CardContent>
            </Card>
          );
        })}
      </section>

      <section className="flex flex-col gap-4">
        <h2 className="font-medium">Active onboarding ({byEmployee.size} employees)</h2>
        {byEmployee.size === 0 && (
          <p className="text-sm text-muted-foreground">
            No onboarding tasks assigned yet.
          </p>
        )}
        {[...byEmployee.entries()].map(([employeeId, tasks]) => {
          const emp = tasks[0].employees as {
            first_name: string; middle_name: string | null; last_name: string; employee_number: string;
          };
          const open = tasks.filter((t) => t.status === "pending").length;
          return (
            <Card className="shadow-none" key={employeeId}>
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle>
                  <Link className="hover:underline" href={`/dashboard/people/employees/${employeeId}`}>
                    {fullName(emp)}
                  </Link>{" "}
                  <span className="font-mono text-xs text-muted-foreground">
                    {emp.employee_number}
                  </span>
                </CardTitle>
                <Badge variant={open === 0 ? "default" : "secondary"}>
                  {open === 0 ? "complete" : `${open} open`}
                </Badge>
              </CardHeader>
              <CardContent className="flex flex-col gap-1.5">
                {tasks.map((task) => (
                  <div
                    className="flex items-center justify-between rounded-md border px-3 py-1.5"
                    key={task.id as string}
                  >
                    <div>
                      <p className={`text-sm ${task.status === "completed" ? "text-muted-foreground line-through" : ""}`}>
                        {task.title as string}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {task.assignee_role as string} · due {task.due_date as string}
                      </p>
                    </div>
                    <TaskToggle
                      completed={task.status === "completed"}
                      taskId={task.id as string}
                    />
                  </div>
                ))}
              </CardContent>
            </Card>
          );
        })}
      </section>
    </div>
  );
}

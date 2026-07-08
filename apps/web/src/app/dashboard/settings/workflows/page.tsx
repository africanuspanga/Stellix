import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import {
  saveWorkflowDefinition,
  saveWorkflowStep,
} from "@/app/dashboard/settings/workflows/actions";
import { OrgFormDialog, type FieldDef } from "@/components/org/org-form-dialog";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export const metadata: Metadata = { title: "Approval workflows — Stellix" };

export default async function WorkflowsSettingsPage() {
  const supabase = await createClient();
  const [{ data: definitions }, { data: steps }, { data: roles }] = await Promise.all([
    supabase.from("workflow_definitions").select("*").order("created_at"),
    supabase.from("workflow_steps").select("*").order("step_order"),
    supabase.from("roles").select("id, name").order("name"),
  ]);

  const stepsByDefinition = new Map<string, NonNullable<typeof steps>>();
  for (const step of steps ?? []) {
    const list = stepsByDefinition.get(step.definition_id) ?? [];
    list.push(step);
    stepsByDefinition.set(step.definition_id, list);
  }
  const roleById = new Map((roles ?? []).map((r) => [r.id as string, r.name as string]));
  const roleOptions = (roles ?? []).map((r) => ({ value: r.id, label: r.name }));

  const definitionFields = (d?: Record<string, unknown>): FieldDef[] => [
    ...(d ? [{ name: "id", type: "hidden" as const, label: "", defaultValue: d.id as string }] : []),
    { name: "name", label: "Name", defaultValue: d?.name as string, required: true, placeholder: "e.g. Leave — two-level approval" },
    {
      name: "entity_type", label: "Applies to", type: "select",
      options: [{ value: "leave_request", label: "Leave requests" }],
      defaultValue: (d?.entity_type as string) ?? "leave_request",
    },
    {
      name: "is_active", label: "Active", type: "select",
      options: [{ value: "true", label: "Active (used for new requests)" }, { value: "false", label: "Inactive" }],
      defaultValue: String(d?.is_active ?? true),
    },
  ];

  const stepFields = (definitionId: string, s?: Record<string, unknown>): FieldDef[] => [
    ...(s ? [{ name: "id", type: "hidden" as const, label: "", defaultValue: s.id as string }] : []),
    { name: "definition_id", type: "hidden", label: "", defaultValue: definitionId },
    { name: "step_order", label: "Step order", type: "number", defaultValue: (s?.step_order as number) ?? 1, required: true },
    {
      name: "approver_type", label: "Approver", type: "select",
      options: [
        { value: "manager", label: "Employee's manager" },
        { value: "role", label: "Anyone holding a role" },
      ],
      defaultValue: (s?.approver_type as string) ?? "manager",
    },
    {
      name: "approver_role_id", label: "Role (for role approver)", type: "select",
      options: roleOptions, emptyOption: "—",
      defaultValue: (s?.approver_role_id as string) ?? "",
    },
    { name: "sla_hours", label: "SLA hours (escalation flag)", type: "number", defaultValue: s?.sla_hours as number },
  ];

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Approval workflows</h1>
          <p className="text-sm text-muted-foreground">
            Sequential approval chains. Without an active definition, requests
            fall back to single manager approval (HR when no manager is linked).
          </p>
        </div>
        <OrgFormDialog
          action={saveWorkflowDefinition}
          fields={definitionFields()}
          submitLabel="Create workflow"
          title="New approval workflow"
          triggerLabel="New workflow"
        />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {(definitions ?? []).length === 0 && (
          <p className="text-sm text-muted-foreground">
            No custom workflows — the manager-approval default applies.
          </p>
        )}
        {(definitions ?? []).map((definition) => {
          const defSteps = stepsByDefinition.get(definition.id) ?? [];
          return (
            <Card className="shadow-none" key={definition.id}>
              <CardHeader className="flex flex-row items-center justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    {definition.name}
                    <Badge variant={definition.is_active ? "default" : "outline"}>
                      {definition.is_active ? "active" : "inactive"}
                    </Badge>
                  </CardTitle>
                  <p className="text-xs text-muted-foreground">
                    {definition.entity_type.replace(/_/g, " ")} · {defSteps.length} steps
                  </p>
                </div>
                <div className="flex gap-1">
                  <OrgFormDialog
                    action={saveWorkflowStep}
                    fields={stepFields(definition.id)}
                    submitLabel="Add step"
                    title="Add approval step"
                    triggerLabel="Add step"
                    triggerVariant="outline"
                  />
                  <OrgFormDialog
                    action={saveWorkflowDefinition}
                    fields={definitionFields(definition)}
                    title="Edit workflow"
                    triggerLabel="Edit"
                    triggerVariant="ghost"
                  />
                </div>
              </CardHeader>
              <CardContent className="flex flex-col gap-1.5">
                {defSteps.map((step) => (
                  <div
                    className="flex items-center justify-between rounded-md border px-3 py-1.5"
                    key={step.id}
                  >
                    <p className="text-sm">
                      <span className="font-mono text-xs text-muted-foreground">
                        {step.step_order}.
                      </span>{" "}
                      {step.approver_type === "manager"
                        ? "Employee's manager"
                        : `Role: ${roleById.get(step.approver_role_id) ?? "?"}`}
                      {step.sla_hours && (
                        <span className="ml-2 text-xs text-muted-foreground">
                          SLA {step.sla_hours}h
                        </span>
                      )}
                    </p>
                    <OrgFormDialog
                      action={saveWorkflowStep}
                      fields={stepFields(definition.id, step)}
                      title="Edit step"
                      triggerLabel="Edit"
                      triggerVariant="ghost"
                    />
                  </div>
                ))}
                {defSteps.length === 0 && (
                  <p className="text-xs text-muted-foreground">
                    No steps yet — add at least one.
                  </p>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}

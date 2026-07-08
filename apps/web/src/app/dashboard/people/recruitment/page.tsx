import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { getLegalEntities, getPositions } from "@/lib/org/queries";
import {
  hireCandidate,
  moveCandidate,
  saveCandidate,
  saveRequisition,
} from "@/app/dashboard/people/recruitment/actions";
import { OrgFormDialog, type FieldDef } from "@/components/org/org-form-dialog";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export const metadata: Metadata = { title: "Recruitment — Stellix" };

const PIPELINE = [
  "applied", "screening", "shortlisted", "assessment", "interview",
  "reference_check", "offer",
];

export default async function RecruitmentPage() {
  const supabase = await createClient();
  const [{ data: requisitions }, { data: candidates }, positions, entities] = await Promise.all([
    supabase.from("job_requisitions").select("*").order("created_at", { ascending: false }),
    supabase.from("candidates").select("*").order("created_at"),
    getPositions(supabase),
    getLegalEntities(supabase),
  ]);

  const requisitionFields = (r?: Record<string, unknown>): FieldDef[] => [
    ...(r ? [{ name: "id", type: "hidden" as const, label: "", defaultValue: r.id as string }] : []),
    { name: "title", label: "Requisition title", defaultValue: r?.title as string, required: true, placeholder: "e.g. Payroll Officer — Dar es Salaam" },
    {
      name: "position_id", label: "For position (vacancy control)", type: "select",
      emptyOption: "No linked position",
      options: positions
        .filter((p) => ["vacant", "budgeted", "approved"].includes(p.status))
        .map((p) => ({ value: p.id, label: `${p.title} (${p.code}) — ${p.status}` })),
      defaultValue: (r?.position_id as string) ?? "",
    },
    { name: "openings", label: "Openings", type: "number", defaultValue: (r?.openings as number) ?? 1 },
    { name: "description", label: "Description", type: "textarea", defaultValue: r?.description as string },
    {
      name: "status", label: "Status", type: "select",
      options: ["draft", "open", "on_hold", "filled", "closed"].map((s) => ({ value: s, label: s.replace(/_/g, " ") })),
      defaultValue: (r?.status as string) ?? "open",
    },
  ];

  const candidateFields = (requisitionId: string): FieldDef[] => [
    { name: "requisition_id", type: "hidden", label: "", defaultValue: requisitionId },
    { name: "first_name", label: "First name", required: true },
    { name: "last_name", label: "Last name", required: true },
    { name: "email", label: "Email" },
    { name: "phone", label: "Phone" },
    {
      name: "source", label: "Source", type: "select",
      options: ["direct", "referral", "job_board", "agency", "internal", "other"]
        .map((s) => ({ value: s, label: s.replace(/_/g, " ") })),
    },
    { name: "notes", label: "Notes", type: "textarea" },
  ];

  const moveFields = (candidateId: string, currentStage: string): FieldDef[] => [
    { name: "id", type: "hidden", label: "", defaultValue: candidateId },
    {
      name: "stage", label: "Move to stage", type: "select", required: true,
      options: [...PIPELINE, "rejected"]
        .filter((s) => s !== currentStage)
        .map((s) => ({ value: s, label: s.replace(/_/g, " ") })),
    },
    { name: "notes", label: "Notes (screening/interview feedback)", type: "textarea" },
  ];

  const hireFields = (candidateId: string): FieldDef[] => [
    { name: "candidate_id", type: "hidden", label: "", defaultValue: candidateId },
    {
      name: "legal_entity_id", label: "Legal entity", type: "select", required: true,
      options: entities.map((e) => ({ value: e.id, label: e.name })),
    },
    { name: "hire_date", label: "Hire date", type: "date", required: true },
    { name: "basic_salary", label: "Basic salary (monthly TZS)", type: "number", step: "0.01" },
  ];

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Recruitment</h1>
          <p className="text-sm text-muted-foreground">
            Applied → screening → shortlisted → assessment → interview →
            reference check → offer → hired
          </p>
        </div>
        <OrgFormDialog
          action={saveRequisition}
          fields={requisitionFields()}
          submitLabel="Open requisition"
          title="New job requisition"
          triggerLabel="New requisition"
        />
      </div>

      {(requisitions ?? []).length === 0 && (
        <p className="text-sm text-muted-foreground">
          No requisitions yet — open one to start receiving candidates.
        </p>
      )}

      {(requisitions ?? []).map((requisition) => {
        const reqCandidates = (candidates ?? []).filter(
          (c) => c.requisition_id === requisition.id,
        );
        const hired = reqCandidates.filter((c) => c.stage === "hired").length;
        return (
          <Card className="shadow-none" key={requisition.id}>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle className="flex items-center gap-2">
                  {requisition.title}
                  <Badge variant={requisition.status === "open" ? "default" : "outline"}>
                    {String(requisition.status).replace(/_/g, " ")}
                  </Badge>
                </CardTitle>
                <p className="text-xs text-muted-foreground">
                  {reqCandidates.length} candidates · {hired}/{requisition.openings} hired
                </p>
              </div>
              <div className="flex gap-1">
                <OrgFormDialog
                  action={saveCandidate}
                  fields={candidateFields(requisition.id)}
                  submitLabel="Add candidate"
                  title={`Add candidate — ${requisition.title}`}
                  triggerLabel="Add candidate"
                  triggerVariant="outline"
                />
                <OrgFormDialog
                  action={saveRequisition}
                  fields={requisitionFields(requisition)}
                  title="Edit requisition"
                  triggerLabel="Edit"
                  triggerVariant="ghost"
                />
              </div>
            </CardHeader>
            <CardContent className="flex flex-col gap-2">
              {reqCandidates.length === 0 && (
                <p className="text-sm text-muted-foreground">No candidates yet.</p>
              )}
              {reqCandidates.map((candidate) => (
                <div
                  className="flex flex-wrap items-center justify-between gap-2 rounded-md border px-3 py-2"
                  key={candidate.id}
                >
                  <div>
                    <p className="text-sm font-medium">
                      {candidate.first_name} {candidate.last_name}
                      <Badge
                        className="ml-2"
                        variant={
                          candidate.stage === "hired"
                            ? "default"
                            : candidate.stage === "rejected"
                              ? "destructive"
                              : "secondary"
                        }
                      >
                        {String(candidate.stage).replace(/_/g, " ")}
                      </Badge>
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {candidate.email ?? "no email"} · {String(candidate.source).replace(/_/g, " ")}
                      {candidate.notes ? ` · ${String(candidate.notes).slice(0, 80)}` : ""}
                    </p>
                  </div>
                  {!["hired", "rejected"].includes(candidate.stage as string) && (
                    <div className="flex gap-1">
                      <OrgFormDialog
                        action={moveCandidate}
                        fields={moveFields(candidate.id, candidate.stage as string)}
                        submitLabel="Move"
                        title={`Move ${candidate.first_name}`}
                        triggerLabel="Move stage"
                        triggerVariant="outline"
                      />
                      {candidate.stage === "offer" && (
                        <OrgFormDialog
                          action={hireCandidate}
                          description="Creates the employee record with the hire action, initial assignment and salary — the position (if linked) becomes occupied."
                          fields={hireFields(candidate.id)}
                          submitLabel="Hire"
                          title={`Hire ${candidate.first_name} ${candidate.last_name}`}
                          triggerLabel="Hire as employee"
                        />
                      )}
                    </div>
                  )}
                </div>
              ))}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

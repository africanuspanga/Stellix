import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import {
  formatMoney,
  getBranches,
  getDepartments,
  getJobGrades,
  getLegalEntities,
  getPositions,
  type PositionRow,
} from "@/lib/org/queries";
import { savePosition } from "@/app/dashboard/organization/actions";
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

export const metadata: Metadata = { title: "Positions — Stellix" };

const STATUS_OPTIONS = [
  { value: "approved", label: "Approved" },
  { value: "budgeted", label: "Budgeted" },
  { value: "vacant", label: "Vacant" },
  { value: "occupied", label: "Occupied" },
  { value: "frozen", label: "Frozen" },
  { value: "abolished", label: "Abolished" },
];

const STATUS_VARIANT: Record<string, "default" | "secondary" | "outline" | "destructive"> = {
  occupied: "default",
  vacant: "outline",
  approved: "secondary",
  budgeted: "secondary",
  frozen: "outline",
  abolished: "destructive",
};

export default async function PositionsPage() {
  const supabase = await createClient();
  const [positions, entities, departments, branches, grades] = await Promise.all([
    getPositions(supabase),
    getLegalEntities(supabase),
    getDepartments(supabase),
    getBranches(supabase),
    getJobGrades(supabase),
  ]);

  const entityOptions = entities.map((e) => ({ value: e.id, label: e.name }));
  const departmentOptions = departments.map((d) => ({
    value: d.id as string,
    label: d.name as string,
  }));
  const branchOptions = branches.map((b) => ({
    value: b.id as string,
    label: b.name as string,
  }));
  const gradeOptions = grades.map((g) => ({
    value: g.id as string,
    label: g.name as string,
  }));
  const byId = new Map(positions.map((p) => [p.id, p.title]));

  const fields = (position?: PositionRow): FieldDef[] => [
    ...(position ? [{ name: "id", type: "hidden" as const, label: "", defaultValue: position.id }] : []),
    { name: "title", label: "Position title", defaultValue: position?.title, required: true, placeholder: "e.g. Payroll Officer" },
    { name: "code", label: "Position code", defaultValue: position?.code, required: true, placeholder: "e.g. POS-014" },
    {
      name: "legal_entity_id",
      label: "Legal entity",
      type: "select",
      options: entityOptions,
      defaultValue: position?.legal_entity_id ?? entityOptions[0]?.value,
      required: true,
    },
    {
      name: "department_id",
      label: "Department",
      type: "select",
      options: departmentOptions,
      emptyOption: "None",
      defaultValue: position?.department_id ?? "",
    },
    {
      name: "branch_id",
      label: "Branch",
      type: "select",
      options: branchOptions,
      emptyOption: "None",
      defaultValue: position?.branch_id ?? "",
    },
    {
      name: "job_grade_id",
      label: "Job grade",
      type: "select",
      options: gradeOptions,
      emptyOption: "None",
      defaultValue: position?.job_grade_id ?? "",
    },
    {
      name: "reports_to_position_id",
      label: "Reports to",
      type: "select",
      options: positions
        .filter((p) => p.id !== position?.id)
        .map((p) => ({ value: p.id, label: `${p.title} (${p.code})` })),
      emptyOption: "None (top of chart)",
      defaultValue: position?.reports_to_position_id ?? "",
    },
    {
      name: "status",
      label: "Status",
      type: "select",
      options: STATUS_OPTIONS,
      defaultValue: position?.status ?? "approved",
    },
    {
      name: "is_budgeted",
      label: "Budgeted",
      type: "select",
      options: [
        { value: "true", label: "Yes" },
        { value: "false", label: "No" },
      ],
      defaultValue: String(position?.is_budgeted ?? false),
    },
    { name: "headcount", label: "Headcount", type: "number", defaultValue: position?.headcount ?? 1 },
    { name: "budgeted_annual_cost", label: "Budgeted annual cost (TZS)", type: "number", defaultValue: position?.budgeted_annual_cost, step: "0.01" },
  ];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h2 className="font-medium">Positions ({positions.length})</h2>
        <OrgFormDialog
          action={savePosition}
          fields={fields()}
          submitLabel="Create position"
          title="New position"
          description="Positions exist independently of employees and drive vacancy control."
          triggerLabel="Add position"
        />
      </div>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Code</TableHead>
            <TableHead>Title</TableHead>
            <TableHead>Department</TableHead>
            <TableHead>Grade</TableHead>
            <TableHead>Reports to</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="text-right">Headcount</TableHead>
            <TableHead className="text-right">Annual budget</TableHead>
            <TableHead className="w-16" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {positions.length === 0 && (
            <TableRow>
              <TableCell className="text-muted-foreground" colSpan={9}>
                No positions yet. Positions must exist before employees can be
                hired into them.
              </TableCell>
            </TableRow>
          )}
          {positions.map((position) => (
            <TableRow key={position.id}>
              <TableCell className="font-mono text-xs">{position.code}</TableCell>
              <TableCell className="font-medium">{position.title}</TableCell>
              <TableCell>{position.departments?.name ?? "—"}</TableCell>
              <TableCell>{position.job_grades?.name ?? "—"}</TableCell>
              <TableCell>
                {position.reports_to_position_id
                  ? byId.get(position.reports_to_position_id) ?? "—"
                  : "—"}
              </TableCell>
              <TableCell>
                <Badge variant={STATUS_VARIANT[position.status] ?? "outline"}>
                  {position.status}
                </Badge>
              </TableCell>
              <TableCell className="text-right font-mono text-xs">
                {position.headcount}
              </TableCell>
              <TableCell className="text-right font-mono text-xs">
                {formatMoney(position.budgeted_annual_cost)}
              </TableCell>
              <TableCell>
                <OrgFormDialog
                  action={savePosition}
                  fields={fields(position)}
                  title={`Edit ${position.title}`}
                  triggerLabel="Edit"
                  triggerVariant="ghost"
                />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

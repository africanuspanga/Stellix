import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { getDepartments, getLegalEntities } from "@/lib/org/queries";
import { saveDepartment } from "@/app/dashboard/organization/actions";
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

export const metadata: Metadata = { title: "Departments — Stellix" };

interface DepartmentRow {
  id: string;
  name: string;
  code: string | null;
  is_active: boolean;
  legal_entity_id: string | null;
  parent_department_id: string | null;
}

export default async function DepartmentsPage() {
  const supabase = await createClient();
  const [departments, entities] = await Promise.all([
    getDepartments(supabase) as Promise<DepartmentRow[]>,
    getLegalEntities(supabase),
  ]);
  const byId = new Map(departments.map((d) => [d.id, d.name]));
  const entityOptions = entities.map((e) => ({ value: e.id, label: e.name }));

  const fields = (dept?: DepartmentRow): FieldDef[] => [
    ...(dept ? [{ name: "id", type: "hidden" as const, label: "", defaultValue: dept.id }] : []),
    { name: "name", label: "Department name", defaultValue: dept?.name, required: true, placeholder: "e.g. Finance" },
    { name: "code", label: "Code", defaultValue: dept?.code, placeholder: "e.g. FIN" },
    {
      name: "legal_entity_id",
      label: "Legal entity",
      type: "select",
      options: entityOptions,
      emptyOption: "All entities",
      defaultValue: dept?.legal_entity_id ?? "",
    },
    {
      name: "parent_department_id",
      label: "Parent department",
      type: "select",
      options: departments
        .filter((d) => d.id !== dept?.id)
        .map((d) => ({ value: d.id, label: d.name })),
      emptyOption: "None (top level)",
      defaultValue: dept?.parent_department_id ?? "",
    },
    ...(dept
      ? [{
          name: "is_active",
          label: "Status",
          type: "select" as const,
          options: [
            { value: "true", label: "Active" },
            { value: "false", label: "Inactive" },
          ],
          defaultValue: String(dept.is_active),
        }]
      : []),
  ];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h2 className="font-medium">Departments ({departments.length})</h2>
        <OrgFormDialog
          action={saveDepartment}
          fields={fields()}
          submitLabel="Create department"
          title="New department"
          triggerLabel="Add department"
        />
      </div>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Name</TableHead>
            <TableHead>Code</TableHead>
            <TableHead>Parent</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="w-16" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {departments.length === 0 && (
            <TableRow>
              <TableCell className="text-muted-foreground" colSpan={5}>
                No departments yet.
              </TableCell>
            </TableRow>
          )}
          {departments.map((dept) => (
            <TableRow key={dept.id}>
              <TableCell className="font-medium">{dept.name}</TableCell>
              <TableCell className="font-mono text-xs">{dept.code ?? "—"}</TableCell>
              <TableCell>
                {dept.parent_department_id
                  ? byId.get(dept.parent_department_id) ?? "—"
                  : "—"}
              </TableCell>
              <TableCell>
                <Badge variant={dept.is_active ? "secondary" : "outline"}>
                  {dept.is_active ? "Active" : "Inactive"}
                </Badge>
              </TableCell>
              <TableCell>
                <OrgFormDialog
                  action={saveDepartment}
                  fields={fields(dept)}
                  title={`Edit ${dept.name}`}
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

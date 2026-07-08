import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { getBranches, getLegalEntities } from "@/lib/org/queries";
import { saveBranch } from "@/app/dashboard/organization/actions";
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

export const metadata: Metadata = { title: "Branches — Stellix" };

const ACTIVE_OPTIONS = [
  { value: "true", label: "Active" },
  { value: "false", label: "Inactive" },
];

export default async function BranchesPage() {
  const supabase = await createClient();
  const [branches, entities] = await Promise.all([
    getBranches(supabase),
    getLegalEntities(supabase),
  ]);
  const entityOptions = entities.map((e) => ({ value: e.id, label: e.name }));

  const fields = (branch?: (typeof branches)[number]): FieldDef[] => [
    ...(branch ? [{ name: "id", type: "hidden" as const, label: "", defaultValue: branch.id }] : []),
    {
      name: "legal_entity_id",
      label: "Legal entity",
      type: "select",
      options: entityOptions,
      defaultValue: branch?.legal_entity_id ?? entityOptions[0]?.value,
      required: true,
    },
    { name: "name", label: "Branch name", defaultValue: branch?.name, required: true, placeholder: "e.g. Dar es Salaam HQ" },
    { name: "code", label: "Code", defaultValue: branch?.code, placeholder: "e.g. DSM-01" },
    { name: "region", label: "Region", defaultValue: branch?.region, placeholder: "e.g. Dar es Salaam" },
    { name: "address", label: "Address", defaultValue: branch?.address },
    ...(branch
      ? [{ name: "is_active", label: "Status", type: "select" as const, options: ACTIVE_OPTIONS, defaultValue: String(branch.is_active) }]
      : []),
  ];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h2 className="font-medium">Branches ({branches.length})</h2>
        <OrgFormDialog
          action={saveBranch}
          fields={fields()}
          submitLabel="Create branch"
          title="New branch"
          triggerLabel="Add branch"
        />
      </div>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Name</TableHead>
            <TableHead>Code</TableHead>
            <TableHead>Region</TableHead>
            <TableHead>Legal entity</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="w-16" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {branches.length === 0 && (
            <TableRow>
              <TableCell className="text-muted-foreground" colSpan={6}>
                No branches yet. Add your first branch to get started.
              </TableCell>
            </TableRow>
          )}
          {branches.map((branch) => (
            <TableRow key={branch.id as string}>
              <TableCell className="font-medium">{branch.name as string}</TableCell>
              <TableCell className="font-mono text-xs">{(branch.code as string) ?? "—"}</TableCell>
              <TableCell>{(branch.region as string) ?? "—"}</TableCell>
              <TableCell>
                {(branch.legal_entities as { name?: string } | null)?.name ?? "—"}
              </TableCell>
              <TableCell>
                <Badge variant={branch.is_active ? "secondary" : "outline"}>
                  {branch.is_active ? "Active" : "Inactive"}
                </Badge>
              </TableCell>
              <TableCell>
                <OrgFormDialog
                  action={saveBranch}
                  fields={fields(branch)}
                  title={`Edit ${branch.name as string}`}
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

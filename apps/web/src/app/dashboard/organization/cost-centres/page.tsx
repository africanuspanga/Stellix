import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { getCostCentres, getLegalEntities } from "@/lib/org/queries";
import { saveCostCentre } from "@/app/dashboard/organization/actions";
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

export const metadata: Metadata = { title: "Cost centres — Stellix" };

interface CostCentreRow {
  id: string;
  name: string;
  code: string;
  is_active: boolean;
  legal_entity_id: string | null;
}

export default async function CostCentresPage() {
  const supabase = await createClient();
  const [centres, entities] = await Promise.all([
    getCostCentres(supabase) as Promise<CostCentreRow[]>,
    getLegalEntities(supabase),
  ]);
  const entityOptions = entities.map((e) => ({ value: e.id, label: e.name }));

  const fields = (centre?: CostCentreRow): FieldDef[] => [
    ...(centre ? [{ name: "id", type: "hidden" as const, label: "", defaultValue: centre.id }] : []),
    { name: "name", label: "Cost centre name", defaultValue: centre?.name, required: true, placeholder: "e.g. Head Office Operations" },
    { name: "code", label: "Code", defaultValue: centre?.code, required: true, placeholder: "e.g. CC-100" },
    {
      name: "legal_entity_id",
      label: "Legal entity",
      type: "select",
      options: entityOptions,
      emptyOption: "All entities",
      defaultValue: centre?.legal_entity_id ?? "",
    },
    ...(centre
      ? [{
          name: "is_active",
          label: "Status",
          type: "select" as const,
          options: [
            { value: "true", label: "Active" },
            { value: "false", label: "Inactive" },
          ],
          defaultValue: String(centre.is_active),
        }]
      : []),
  ];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h2 className="font-medium">Cost centres ({centres.length})</h2>
        <OrgFormDialog
          action={saveCostCentre}
          fields={fields()}
          submitLabel="Create cost centre"
          title="New cost centre"
          triggerLabel="Add cost centre"
        />
      </div>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Code</TableHead>
            <TableHead>Name</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="w-16" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {centres.length === 0 && (
            <TableRow>
              <TableCell className="text-muted-foreground" colSpan={4}>
                No cost centres yet.
              </TableCell>
            </TableRow>
          )}
          {centres.map((centre) => (
            <TableRow key={centre.id}>
              <TableCell className="font-mono text-xs">{centre.code}</TableCell>
              <TableCell className="font-medium">{centre.name}</TableCell>
              <TableCell>
                <Badge variant={centre.is_active ? "secondary" : "outline"}>
                  {centre.is_active ? "Active" : "Inactive"}
                </Badge>
              </TableCell>
              <TableCell>
                <OrgFormDialog
                  action={saveCostCentre}
                  fields={fields(centre)}
                  title={`Edit ${centre.name}`}
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

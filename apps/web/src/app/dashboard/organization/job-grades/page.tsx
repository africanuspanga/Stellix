import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { formatMoney, getJobFamilies, getJobGrades } from "@/lib/org/queries";
import { saveJobFamily, saveJobGrade } from "@/app/dashboard/organization/actions";
import { OrgFormDialog, type FieldDef } from "@/components/org/org-form-dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export const metadata: Metadata = { title: "Jobs & grades — Stellix" };

interface FamilyRow {
  id: string;
  name: string;
  description: string | null;
}
interface GradeRow {
  id: string;
  name: string;
  level: number | null;
  band_min: number | null;
  band_max: number | null;
  currency: string;
  job_family_id: string | null;
  job_families: { name: string } | null;
}

export default async function JobGradesPage() {
  const supabase = await createClient();
  const [families, grades] = await Promise.all([
    getJobFamilies(supabase) as Promise<FamilyRow[]>,
    getJobGrades(supabase) as unknown as Promise<GradeRow[]>,
  ]);
  const familyOptions = families.map((f) => ({ value: f.id, label: f.name }));

  const familyFields = (family?: FamilyRow): FieldDef[] => [
    ...(family ? [{ name: "id", type: "hidden" as const, label: "", defaultValue: family.id }] : []),
    { name: "name", label: "Family name", defaultValue: family?.name, required: true, placeholder: "e.g. Engineering" },
    { name: "description", label: "Description", defaultValue: family?.description },
  ];

  const gradeFields = (grade?: GradeRow): FieldDef[] => [
    ...(grade ? [{ name: "id", type: "hidden" as const, label: "", defaultValue: grade.id }] : []),
    { name: "name", label: "Grade name", defaultValue: grade?.name, required: true, placeholder: "e.g. G5 — Senior Officer" },
    {
      name: "job_family_id",
      label: "Job family",
      type: "select",
      options: familyOptions,
      emptyOption: "None",
      defaultValue: grade?.job_family_id ?? "",
    },
    { name: "level", label: "Level (rank order)", type: "number", defaultValue: grade?.level },
    { name: "band_min", label: "Salary band minimum (monthly)", type: "number", defaultValue: grade?.band_min, step: "0.01" },
    { name: "band_max", label: "Salary band maximum (monthly)", type: "number", defaultValue: grade?.band_max, step: "0.01" },
    { name: "currency", label: "Currency", defaultValue: grade?.currency ?? "TZS" },
  ];

  return (
    <div className="flex flex-col gap-8">
      <section className="flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <h2 className="font-medium">Job families ({families.length})</h2>
          <OrgFormDialog
            action={saveJobFamily}
            fields={familyFields()}
            submitLabel="Create family"
            title="New job family"
            triggerLabel="Add family"
            triggerVariant="outline"
          />
        </div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Description</TableHead>
              <TableHead className="w-16" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {families.length === 0 && (
              <TableRow>
                <TableCell className="text-muted-foreground" colSpan={3}>
                  No job families yet.
                </TableCell>
              </TableRow>
            )}
            {families.map((family) => (
              <TableRow key={family.id}>
                <TableCell className="font-medium">{family.name}</TableCell>
                <TableCell className="text-muted-foreground">
                  {family.description ?? "—"}
                </TableCell>
                <TableCell>
                  <OrgFormDialog
                    action={saveJobFamily}
                    fields={familyFields(family)}
                    title={`Edit ${family.name}`}
                    triggerLabel="Edit"
                    triggerVariant="ghost"
                  />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </section>

      <section className="flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <h2 className="font-medium">Job grades &amp; salary bands ({grades.length})</h2>
          <OrgFormDialog
            action={saveJobGrade}
            fields={gradeFields()}
            submitLabel="Create grade"
            title="New job grade"
            triggerLabel="Add grade"
          />
        </div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Level</TableHead>
              <TableHead>Grade</TableHead>
              <TableHead>Family</TableHead>
              <TableHead>Salary band</TableHead>
              <TableHead className="w-16" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {grades.length === 0 && (
              <TableRow>
                <TableCell className="text-muted-foreground" colSpan={5}>
                  No job grades yet.
                </TableCell>
              </TableRow>
            )}
            {grades.map((grade) => (
              <TableRow key={grade.id}>
                <TableCell className="font-mono text-xs">{grade.level ?? "—"}</TableCell>
                <TableCell className="font-medium">{grade.name}</TableCell>
                <TableCell>{grade.job_families?.name ?? "—"}</TableCell>
                <TableCell className="font-mono text-xs">
                  {grade.band_min === null && grade.band_max === null
                    ? "—"
                    : `${formatMoney(grade.band_min, grade.currency)} – ${formatMoney(grade.band_max, grade.currency)}`}
                </TableCell>
                <TableCell>
                  <OrgFormDialog
                    action={saveJobGrade}
                    fields={gradeFields(grade)}
                    title={`Edit ${grade.name}`}
                    triggerLabel="Edit"
                    triggerVariant="ghost"
                  />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </section>
    </div>
  );
}

import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { getBranches, getDepartments, getLegalEntities, getPositions } from "@/lib/org/queries";
import { fullName, getEmployees } from "@/lib/people/queries";
import { EmployeeForm } from "@/components/people/employee-form";

export const metadata: Metadata = { title: "New employee — Stellix" };

export default async function NewEmployeePage() {
  const supabase = await createClient();
  const [entities, positions, departments, branches, employees] = await Promise.all([
    getLegalEntities(supabase),
    getPositions(supabase),
    getDepartments(supabase),
    getBranches(supabase),
    getEmployees(supabase),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">New employee</h1>
        <p className="text-sm text-muted-foreground">
          Creates the central employee record, the hire action, and the initial
          effective-dated assignment and salary.
        </p>
      </div>
      <EmployeeForm
        branches={branches.map((b) => ({ value: b.id as string, label: b.name as string }))}
        departments={departments.map((d) => ({ value: d.id as string, label: d.name as string }))}
        entities={entities.map((e) => ({ value: e.id, label: e.name }))}
        managers={employees.map((e) => ({ value: e.id, label: fullName(e) }))}
        positions={positions
          .filter((p) => p.status !== "abolished")
          .map((p) => ({ value: p.id, label: `${p.title} (${p.code}) — ${p.status}` }))}
      />
    </div>
  );
}

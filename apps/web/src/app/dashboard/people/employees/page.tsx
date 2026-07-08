import type { Metadata } from "next";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { fullName, getCurrentAssignments, getEmployees } from "@/lib/people/queries";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export const metadata: Metadata = { title: "Employees — Stellix" };

const STATUS_VARIANT: Record<string, "default" | "secondary" | "outline" | "destructive"> = {
  active: "default",
  probation: "secondary",
  onboarding: "secondary",
  on_leave: "outline",
  suspended: "destructive",
  exiting: "outline",
  exited: "outline",
};

export default async function EmployeesPage() {
  const supabase = await createClient();
  const employees = await getEmployees(supabase);
  const assignments = await getCurrentAssignments(
    supabase,
    employees.map((e) => e.id),
  );
  const byEmployee = new Map(
    assignments.map((a) => [a.employee_id as string, a]),
  );

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Employees</h1>
          <p className="text-sm text-muted-foreground">
            {employees.length} people · one central record per employee
          </p>
        </div>
        <Button
          nativeButton={false}
          render={<Link href="/dashboard/people/employees/new" />}
        >
          New employee
        </Button>
      </div>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>No.</TableHead>
            <TableHead>Name</TableHead>
            <TableHead>Position</TableHead>
            <TableHead>Department</TableHead>
            <TableHead>Type</TableHead>
            <TableHead>Status</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {employees.length === 0 && (
            <TableRow>
              <TableCell className="text-muted-foreground" colSpan={6}>
                No employees yet. Hire your first employee to get started.
              </TableCell>
            </TableRow>
          )}
          {employees.map((employee) => {
            const assignment = byEmployee.get(employee.id) as
              | {
                  positions?: { title?: string } | null;
                  departments?: { name?: string } | null;
                }
              | undefined;
            return (
              <TableRow key={employee.id}>
                <TableCell className="font-mono text-xs">
                  {employee.employee_number}
                </TableCell>
                <TableCell className="font-medium">
                  <Link
                    className="hover:underline"
                    href={`/dashboard/people/employees/${employee.id}`}
                  >
                    {fullName(employee)}
                  </Link>
                </TableCell>
                <TableCell>{assignment?.positions?.title ?? "—"}</TableCell>
                <TableCell>{assignment?.departments?.name ?? "—"}</TableCell>
                <TableCell className="text-muted-foreground">
                  {employee.employment_type.replace(/_/g, " ")}
                </TableCell>
                <TableCell>
                  <Badge variant={STATUS_VARIANT[employee.status] ?? "outline"}>
                    {employee.status.replace(/_/g, " ")}
                  </Badge>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}

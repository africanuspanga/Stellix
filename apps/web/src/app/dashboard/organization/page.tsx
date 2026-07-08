import type { Metadata } from "next";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export const metadata: Metadata = { title: "Organization — Stellix" };

const SECTIONS = [
  { table: "branches", label: "Branches", href: "/dashboard/organization/branches" },
  { table: "departments", label: "Departments", href: "/dashboard/organization/departments" },
  { table: "cost_centres", label: "Cost centres", href: "/dashboard/organization/cost-centres" },
  { table: "job_grades", label: "Job grades", href: "/dashboard/organization/job-grades" },
  { table: "positions", label: "Positions", href: "/dashboard/organization/positions" },
];

export default async function OrganizationOverviewPage() {
  const supabase = await createClient();
  const counts = await Promise.all(
    SECTIONS.map(async (s) => {
      const { count } = await supabase
        .from(s.table)
        .select("id", { count: "exact", head: true });
      return count ?? 0;
    }),
  );

  const { count: vacant } = await supabase
    .from("positions")
    .select("id", { count: "exact", head: true })
    .eq("status", "vacant");

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {SECTIONS.map((section, i) => (
        <Link href={section.href} key={section.table}>
          <Card className="shadow-none transition-colors hover:bg-muted/50">
            <CardHeader>
              <CardDescription>{section.label}</CardDescription>
              <CardTitle className="font-mono text-2xl">{counts[i]}</CardTitle>
            </CardHeader>
          </Card>
        </Link>
      ))}
      <Link href="/dashboard/organization/positions">
        <Card className="shadow-none transition-colors hover:bg-muted/50">
          <CardHeader>
            <CardDescription>Vacant positions</CardDescription>
            <CardTitle className="font-mono text-2xl">{vacant ?? 0}</CardTitle>
          </CardHeader>
        </Card>
      </Link>
    </div>
  );
}

import Link from "next/link";

const TABS = [
  { href: "/dashboard/organization", label: "Overview" },
  { href: "/dashboard/organization/branches", label: "Branches" },
  { href: "/dashboard/organization/departments", label: "Departments" },
  { href: "/dashboard/organization/cost-centres", label: "Cost centres" },
  { href: "/dashboard/organization/job-grades", label: "Jobs & grades" },
  { href: "/dashboard/organization/positions", label: "Positions" },
  { href: "/dashboard/organization/org-chart", label: "Org chart" },
];

export default function OrganizationLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Organization</h1>
        <p className="text-sm text-muted-foreground">
          Structure, job architecture and position control
        </p>
      </div>
      <nav className="flex flex-wrap gap-1 border-b pb-2 text-sm">
        {TABS.map((tab) => (
          <Link
            className="rounded-md px-3 py-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            href={tab.href}
            key={tab.href}
          >
            {tab.label}
          </Link>
        ))}
      </nav>
      {children}
    </div>
  );
}

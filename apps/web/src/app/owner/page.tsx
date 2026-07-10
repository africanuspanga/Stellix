import type { Metadata } from "next";
import {
  Building2Icon,
  UsersIcon,
  UserRoundIcon,
  BanknoteIcon,
  SparklesIcon,
  TrendingUpIcon,
} from "lucide-react";
import { getPlatformSummary, getTenantStats } from "@/lib/platform/owner";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export const metadata: Metadata = { title: "Platform — Stellix" };

const TZS = new Intl.NumberFormat("en-TZ", {
  style: "currency",
  currency: "TZS",
  maximumFractionDigits: 0,
});

function Stat({
  label,
  value,
  hint,
  icon,
}: {
  label: string;
  value: string;
  hint?: string;
  icon: React.ReactNode;
}) {
  return (
    <Card className="gap-2 p-4">
      <div className="flex items-center justify-between text-muted-foreground">
        <span className="text-sm">{label}</span>
        {icon}
      </div>
      <div className="text-2xl font-semibold tracking-tight tabular-nums">{value}</div>
      {hint && <span className="text-xs text-muted-foreground">{hint}</span>}
    </Card>
  );
}

const STATUS_VARIANT: Record<string, "default" | "secondary" | "outline"> = {
  active: "default",
  trial: "secondary",
  suspended: "outline",
  cancelled: "outline",
};

export default async function OwnerPage() {
  const [summary, tenants] = await Promise.all([
    getPlatformSummary(),
    getTenantStats(),
  ]);

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">Platform overview</h1>
        <p className="text-sm text-muted-foreground">
          Every company on Stellix — metadata and aggregates only, no customer
          PII. For operational excellence, not surveillance.
        </p>
      </div>

      <section className="grid grid-cols-2 gap-4 lg:grid-cols-3">
        <Stat
          label="Companies"
          value={String(summary?.tenants ?? 0)}
          hint={`${summary?.activeTenants ?? 0} active · ${summary?.trialTenants ?? 0} trial`}
          icon={<Building2Icon className="size-4" />}
        />
        <Stat
          label="New (30 days)"
          value={`+${summary?.newTenants30d ?? 0}`}
          hint="Companies onboarded"
          icon={<TrendingUpIcon className="size-4" />}
        />
        <Stat
          label="Employees managed"
          value={(summary?.employees ?? 0).toLocaleString()}
          hint="Across all companies"
          icon={<UsersIcon className="size-4" />}
        />
        <Stat
          label="Active users"
          value={(summary?.users ?? 0).toLocaleString()}
          icon={<UserRoundIcon className="size-4" />}
        />
        <Stat
          label="Payroll this month"
          value={TZS.format(summary?.payrollNetThisMonth ?? 0)}
          hint="Net, approved runs"
          icon={<BanknoteIcon className="size-4" />}
        />
        <Stat
          label="AI usage (30d)"
          value={(summary?.aiInteractions30d ?? 0).toLocaleString()}
          hint={`${summary?.agentActions30d ?? 0} agent actions`}
          icon={<SparklesIcon className="size-4" />}
        />
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-medium text-muted-foreground">Companies</h2>
        <Card className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Company</TableHead>
                <TableHead>Plan</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Employees</TableHead>
                <TableHead className="text-right">Users</TableHead>
                <TableHead className="text-right">Payroll / mo</TableHead>
                <TableHead>Joined</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {tenants.length === 0 && (
                <TableRow>
                  <TableCell className="py-8 text-center text-muted-foreground" colSpan={7}>
                    No companies yet.
                  </TableCell>
                </TableRow>
              )}
              {tenants.map((t) => (
                <TableRow key={t.tenantId}>
                  <TableCell className="font-medium">{t.name}</TableCell>
                  <TableCell className="capitalize text-muted-foreground">
                    {t.plan.replace(/_/g, " ")}
                  </TableCell>
                  <TableCell>
                    <Badge variant={STATUS_VARIANT[t.status] ?? "outline"}>{t.status}</Badge>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{t.employeeCount}</TableCell>
                  <TableCell className="text-right tabular-nums">{t.userCount}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {t.payrollNetThisMonth > 0 ? TZS.format(t.payrollNetThisMonth) : "—"}
                  </TableCell>
                  <TableCell className="font-mono text-xs text-muted-foreground">
                    {t.createdAt.slice(0, 10)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      </section>
    </div>
  );
}

import type { Metadata } from "next";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getComplianceSnapshot, type ComplianceItem } from "@/lib/compliance/checks";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export const metadata: Metadata = { title: "Compliance — Stellix" };

function CheckCard({
  title,
  items,
  emptyText,
}: {
  title: string;
  items: ComplianceItem[];
  emptyText: string;
}) {
  return (
    <Card className={`shadow-none ${items.length > 0 ? "border-destructive/40" : ""}`}>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>{title}</CardTitle>
        <Badge variant={items.length > 0 ? "destructive" : "outline"}>{items.length}</Badge>
      </CardHeader>
      <CardContent className="flex flex-col gap-1.5">
        {items.length === 0 && <p className="text-sm text-muted-foreground">{emptyText}</p>}
        {items.slice(0, 8).map((item) => (
          <Link
            className="flex items-center justify-between rounded-md border px-3 py-1.5 text-sm hover:bg-muted/50"
            href={`/dashboard/people/employees/${item.employeeId}`}
            key={`${item.employeeId}-${item.detail}`}
          >
            <span className="font-medium">{item.name}</span>
            <span className="text-xs text-muted-foreground">{item.detail}</span>
          </Link>
        ))}
        {items.length > 8 && (
          <p className="text-xs text-muted-foreground">…and {items.length - 8} more</p>
        )}
      </CardContent>
    </Card>
  );
}

export default async function ComplianceDashboardPage() {
  const supabase = await createClient();
  const snapshot = await getComplianceSnapshot(supabase);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Compliance dashboard</h1>
          <p className="text-sm text-muted-foreground">
            Contracts, permits, wages, statutory identifiers and filings ·{" "}
            <Link className="underline underline-offset-2" href="/dashboard/compliance/filings">
              filing tracker →
            </Link>
          </p>
        </div>
        {snapshot.draftRuleCount > 0 && (
          <Badge variant="destructive">
            {snapshot.draftRuleCount} statutory rules still DRAFT — verify before live payroll
          </Badge>
        )}
      </div>

      {snapshot.overdueFilings.length > 0 && (
        <Card className="border-destructive/50 shadow-none">
          <CardHeader>
            <CardTitle className="text-destructive">
              Overdue statutory filings ({snapshot.overdueFilings.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-1.5 text-sm">
            {snapshot.overdueFilings.map((f, i) => (
              <p key={i}>
                <span className="font-mono uppercase">{f.filingType}</span> for {f.period} — was
                due {f.dueDate} · TZS {f.amount.toLocaleString()}
              </p>
            ))}
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <CheckCard
          emptyText="Every active employee has a contract on file."
          items={snapshot.missingContracts}
          title="Missing contracts"
        />
        <CheckCard
          emptyText="No contracts expiring in the next 60 days."
          items={snapshot.expiringContracts}
          title="Expiring contracts (60 days)"
        />
        <CheckCard
          emptyText="No work permits expiring in the next 90 days."
          items={snapshot.expiringPermits}
          title="Expiring work permits (90 days)"
        />
        <CheckCard
          emptyText="Everyone is at or above the minimum-wage floor."
          items={snapshot.belowMinimumWage}
          title="Below minimum wage"
        />
        <CheckCard
          emptyText="All employee files have NIDA, TIN and NSSF numbers."
          items={snapshot.incompleteFiles}
          title="Incomplete statutory identifiers"
        />
      </div>
    </div>
  );
}

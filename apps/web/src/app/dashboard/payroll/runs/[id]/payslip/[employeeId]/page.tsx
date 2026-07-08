import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getTenancyContext } from "@/lib/tenancy/context";
import { formatMoney } from "@/lib/org/queries";
import { LogoIcon } from "@/components/logo";
import { Badge } from "@/components/ui/badge";

export const metadata: Metadata = { title: "Payslip — Stellix" };

interface Line {
  code: string;
  name: string;
  amount: number;
}

export default async function PayslipPage({
  params,
}: {
  params: Promise<{ id: string; employeeId: string }>;
}) {
  const { id, employeeId } = await params;
  const supabase = await createClient();
  const context = await getTenancyContext();
  const [{ data: run }, { data: line }] = await Promise.all([
    // Metadata view: readable by the employee themself, exposes no totals.
    supabase.from("payslip_run_meta").select("*").eq("id", id).maybeSingle(),
    supabase
      .from("payroll_run_lines")
      .select("*")
      .eq("run_id", id)
      .eq("employee_id", employeeId)
      .maybeSingle(),
  ]);
  if (!run || !line || !context) notFound();

  const period = `${run.period_year}-${String(run.period_month).padStart(2, "0")}`;
  const earnings = (line.earnings as Line[] | null) ?? [];
  const statutory = (line.statutory_deductions as Line[] | null) ?? [];
  const other = (line.other_deductions as Line[] | null) ?? [];
  const employer = (line.employer_contributions as Line[] | null) ?? [];
  const isFinal = ["approved", "paid", "closed"].includes(run.status as string);

  return (
    <div className="mx-auto w-full max-w-xl print:max-w-none">
      <div className="mb-4 flex items-center justify-between print:hidden">
        {!isFinal && <Badge variant="outline">PREVIEW — run not yet approved</Badge>}
        <p className="text-xs text-muted-foreground">Print to save as PDF.</p>
      </div>
      <article className="flex flex-col gap-5 rounded-xl border bg-background p-8 text-sm print:border-none">
        <header className="flex items-center justify-between border-b pb-4">
          <div className="flex items-center gap-2">
            <LogoIcon className="size-5" />
            <div>
              <p className="font-bold leading-tight">
                {(run.entity_name as string | null) ?? context.activeTenant?.name}
              </p>
              <p className="text-xs text-muted-foreground">Payslip · {period}</p>
            </div>
          </div>
          <div className="text-right text-xs">
            <p className="font-medium">{line.employee_name}</p>
            <p className="font-mono text-muted-foreground">{line.employee_number}</p>
          </div>
        </header>

        <section>
          <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Earnings
          </h2>
          <div className="flex flex-col gap-1">
            <div className="flex justify-between">
              <span>Basic salary</span>
              <span className="font-mono">{formatMoney(Number(line.basic_salary))}</span>
            </div>
            {earnings.map((e) => (
              <div className="flex justify-between" key={e.code}>
                <span>{e.name}</span>
                <span className="font-mono">{formatMoney(e.amount)}</span>
              </div>
            ))}
            <div className="flex justify-between border-t pt-1 font-medium">
              <span>Gross pay</span>
              <span className="font-mono">{formatMoney(Number(line.gross_pay))}</span>
            </div>
          </div>
        </section>

        <section>
          <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Deductions
          </h2>
          <div className="flex flex-col gap-1">
            {[...statutory, ...other].map((d) => (
              <div className="flex justify-between" key={d.code}>
                <span>{d.name}</span>
                <span className="font-mono">−{formatMoney(d.amount)}</span>
              </div>
            ))}
            <div className="flex justify-between border-t pt-1 font-medium">
              <span>Total deductions</span>
              <span className="font-mono">−{formatMoney(Number(line.total_deductions))}</span>
            </div>
          </div>
        </section>

        <section className="rounded-lg bg-muted/50 p-3">
          <div className="flex items-center justify-between text-base font-semibold">
            <span>Net pay</span>
            <span className="font-mono">{formatMoney(Number(line.net_pay))}</span>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            Taxable income {formatMoney(Number(line.taxable_income))} · PAYE{" "}
            {formatMoney(Number(line.paye))}
          </p>
        </section>

        <section>
          <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Employer contributions (not deducted from pay)
          </h2>
          <div className="flex flex-col gap-1 text-xs text-muted-foreground">
            {employer.map((c) => (
              <div className="flex justify-between" key={c.code}>
                <span>{c.name}</span>
                <span className="font-mono">{formatMoney(c.amount)}</span>
              </div>
            ))}
          </div>
        </section>

        <footer className="border-t pt-3 text-[10px] text-muted-foreground">
          Generated by Stellix · run {String(run.id).slice(0, 8)} · status {run.status} ·
          amounts in TZS. This payslip is reproducible from the run&apos;s immutable
          calculation snapshot.
        </footer>
      </article>
    </div>
  );
}

import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getTenancyContext } from "@/lib/tenancy/context";
import { getBranding } from "@/lib/payslip/branding";
import { PayslipDocument, type PayslipData } from "@/components/payslip/payslip-document";
import { PrintButton } from "@/components/payslip/print-button";
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
  if (!context?.activeTenant) notFound();

  const [{ data: run }, { data: line }, branding] = await Promise.all([
    // Metadata view: readable by the employee themself, exposes no totals.
    supabase.from("payslip_run_meta").select("*").eq("id", id).maybeSingle(),
    supabase
      .from("payroll_run_lines")
      .select("*")
      .eq("run_id", id)
      .eq("employee_id", employeeId)
      .maybeSingle(),
    getBranding(supabase, context.activeTenant.id),
  ]);
  if (!run || !line) notFound();

  const isFinal = ["approved", "paid", "closed"].includes(run.status as string);

  const data: PayslipData = {
    companyName:
      (run.entity_name as string | null) ?? context.activeTenant.name,
    period: `${run.period_year}-${String(run.period_month).padStart(2, "0")}`,
    employeeName: line.employee_name as string,
    employeeNumber: line.employee_number as string,
    basicSalary: Number(line.basic_salary),
    earnings: (line.earnings as Line[] | null) ?? [],
    grossPay: Number(line.gross_pay),
    deductions: [
      ...((line.statutory_deductions as Line[] | null) ?? []),
      ...((line.other_deductions as Line[] | null) ?? []),
    ],
    totalDeductions: Number(line.total_deductions),
    netPay: Number(line.net_pay),
    taxableIncome: Number(line.taxable_income),
    paye: Number(line.paye),
    employerContributions: (line.employer_contributions as Line[] | null) ?? [],
    status: run.status as string,
    runId: run.id as string,
  };

  return (
    <div className="mx-auto w-full max-w-xl print:max-w-none">
      <div className="mb-4 flex items-center justify-between print:hidden">
        {!isFinal ? (
          <Badge variant="outline">PREVIEW — run not yet approved</Badge>
        ) : (
          <span />
        )}
        <PrintButton />
      </div>
      <PayslipDocument branding={branding} data={data} />
    </div>
  );
}

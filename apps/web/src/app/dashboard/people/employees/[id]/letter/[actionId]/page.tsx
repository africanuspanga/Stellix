import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getTenancyContext } from "@/lib/tenancy/context";
import { formatMoney } from "@/lib/org/queries";
import { fullName, getEmployee } from "@/lib/people/queries";
import { LogoIcon } from "@/components/logo";

export const metadata: Metadata = { title: "Employment letter — Stellix" };

const LETTER_TITLES: Record<string, string> = {
  hire: "Letter of Employment",
  promotion: "Letter of Promotion",
  transfer: "Letter of Transfer",
  salary_adjustment: "Salary Adjustment Notification",
  acting_appointment: "Acting Appointment Letter",
  contract_renewal: "Contract Renewal Letter",
  probation_extension: "Probation Extension Letter",
  probation_confirmation: "Letter of Confirmation",
  suspension: "Letter of Suspension",
  return_from_suspension: "Return from Suspension Letter",
  demotion: "Letter of Demotion",
  branch_transfer: "Branch Transfer Letter",
  department_transfer: "Department Transfer Letter",
  manager_change: "Reporting Line Change Notification",
  cost_centre_change: "Cost Centre Change Notification",
  exit: "Letter of Separation",
};

export default async function LetterPage({
  params,
}: {
  params: Promise<{ id: string; actionId: string }>;
}) {
  const { id, actionId } = await params;
  const supabase = await createClient();
  const context = await getTenancyContext();
  const employee = await getEmployee(supabase, id);
  const { data: action } = await supabase
    .from("employment_actions")
    .select("*")
    .eq("id", actionId)
    .eq("employee_id", id)
    .maybeSingle();
  if (!employee || !action || !context) notFound();

  const details = (action.details ?? {}) as {
    position_id?: string | null;
    department_id?: string | null;
    branch_id?: string | null;
    basic_salary?: number | null;
  };

  const [position, department, branch] = await Promise.all([
    details.position_id
      ? supabase.from("positions").select("title").eq("id", details.position_id).maybeSingle()
      : null,
    details.department_id
      ? supabase.from("departments").select("name").eq("id", details.department_id).maybeSingle()
      : null,
    details.branch_id
      ? supabase.from("branches").select("name").eq("id", details.branch_id).maybeSingle()
      : null,
  ]);

  const changes: string[] = [];
  if (position?.data?.title) changes.push(`your position will be ${position.data.title}`);
  if (department?.data?.name) changes.push(`your department will be ${department.data.name}`);
  if (branch?.data?.name) changes.push(`your duty station will be ${branch.data.name}`);
  if (details.basic_salary)
    changes.push(`your basic salary will be ${formatMoney(details.basic_salary)} per month`);

  const title =
    LETTER_TITLES[action.action_type as string] ?? "Employment Action Letter";
  const companyName = context.activeTenant?.name ?? "The Company";
  const today = new Date().toISOString().slice(0, 10);

  return (
    <div className="mx-auto w-full max-w-2xl print:max-w-none">
      <div className="mb-4 flex justify-end print:hidden">
        <p className="text-xs text-muted-foreground">
          Use your browser&apos;s Print function to save this letter as PDF.
        </p>
      </div>
      <article className="flex flex-col gap-6 rounded-xl border bg-background p-10 text-sm leading-relaxed print:border-none">
        <header className="flex items-center justify-between border-b pb-6">
          <div className="flex items-center gap-2">
            <LogoIcon className="size-5" />
            <span className="font-bold tracking-tight">{companyName}</span>
          </div>
          <p className="font-mono text-xs text-muted-foreground">{today}</p>
        </header>

        <div>
          <p>{fullName(employee)}</p>
          <p className="text-muted-foreground">
            Employee No. {employee.employee_number}
          </p>
        </div>

        <h1 className="text-base font-semibold uppercase tracking-wide">
          RE: {title}
        </h1>

        <p>Dear {employee.first_name},</p>

        <p>
          We write to formally notify you of the following employment action,
          effective <strong>{action.effective_date}</strong>:{" "}
          <strong>{(action.action_type as string).replace(/_/g, " ")}</strong>.
        </p>

        {changes.length > 0 && (
          <p>
            Following this action, {changes.join("; ")}. All other terms and
            conditions of your employment remain unchanged.
          </p>
        )}

        {action.reason && (
          <p>
            <span className="text-muted-foreground">Reason: </span>
            {action.reason}
          </p>
        )}

        <p>
          Please contact the Human Resources office should you require any
          clarification regarding this letter.
        </p>

        <div className="mt-8 flex flex-col gap-10">
          <div>
            <p className="mb-8">Yours sincerely,</p>
            <p className="border-t pt-2 font-medium">
              For and on behalf of {companyName}
            </p>
            <p className="text-xs text-muted-foreground">
              Human Resources
            </p>
          </div>
          <div>
            <p className="mb-8 text-muted-foreground">
              Acknowledged by employee:
            </p>
            <p className="border-t pt-2 text-xs text-muted-foreground">
              Signature &amp; date
            </p>
          </div>
        </div>
      </article>
    </div>
  );
}

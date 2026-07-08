import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { formatMoney, getBranches, getDepartments, getPositions } from "@/lib/org/queries";
import { daysUntil, fullName, getEmployee, getEmployeeDetail, getEmployees } from "@/lib/people/queries";
import {
  createEmploymentAction,
  saveBankAccount,
  saveContract,
  saveDependant,
  updateEmployeePersonal,
} from "@/app/dashboard/people/employees/actions";
import { generateInvite } from "@/app/dashboard/people/employees/invite-actions";
import { OrgFormDialog, type FieldDef } from "@/components/org/org-form-dialog";
import { DocumentUpload } from "@/components/people/document-upload";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export const metadata: Metadata = { title: "Employee — Stellix" };

const ACTION_TYPE_OPTIONS = [
  "promotion", "transfer", "salary_adjustment", "acting_appointment",
  "contract_renewal", "probation_extension", "probation_confirmation",
  "suspension", "return_from_suspension", "demotion", "branch_transfer",
  "department_transfer", "manager_change",
].map((t) => ({ value: t, label: t.replace(/_/g, " ") }));

function Section({ title, action, children }: {
  title: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <Card className="shadow-none">
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>{title}</CardTitle>
        {action}
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

function Info({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-sm">{value ?? "—"}</p>
    </div>
  );
}

export default async function EmployeeDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();
  const employee = await getEmployee(supabase, id);
  if (!employee) notFound();

  const [detail, positions, departments, branches, allEmployees] = await Promise.all([
    getEmployeeDetail(supabase, id),
    getPositions(supabase),
    getDepartments(supabase),
    getBranches(supabase),
    getEmployees(supabase),
  ]);

  const currentAssignment = detail.assignments.find((a) => !a.effective_to) as
    | {
        positions?: { title?: string; code?: string } | null;
        departments?: { name?: string } | null;
        branches?: { name?: string } | null;
        manager?: { first_name?: string; last_name?: string } | { first_name?: string; last_name?: string }[] | null;
      }
    | undefined;
  const currentComp = detail.compensation.find((c) => !c.effective_to);
  const manager = Array.isArray(currentAssignment?.manager)
    ? currentAssignment?.manager[0]
    : currentAssignment?.manager;

  // Signed URLs for private document downloads (1 hour).
  const signedUrls = new Map<string, string>();
  for (const doc of detail.documents as Array<{ id: string; storage_path: string }>) {
    const { data } = await supabase.storage
      .from("employee-documents")
      .createSignedUrl(doc.storage_path, 3600);
    if (data?.signedUrl) signedUrls.set(doc.id, data.signedUrl);
  }

  const positionOptions = positions
    .filter((p) => p.status !== "abolished")
    .map((p) => ({ value: p.id, label: `${p.title} (${p.code})` }));
  const departmentOptions = departments.map((d) => ({ value: d.id as string, label: d.name as string }));
  const branchOptions = branches.map((b) => ({ value: b.id as string, label: b.name as string }));
  const managerOptions = allEmployees
    .filter((e) => e.id !== id)
    .map((e) => ({ value: e.id, label: fullName(e) }));

  const personalFields: FieldDef[] = [
    { name: "id", type: "hidden", label: "", defaultValue: id },
    { name: "first_name", label: "First name", defaultValue: employee.first_name, required: true },
    { name: "middle_name", label: "Middle name", defaultValue: employee.middle_name },
    { name: "last_name", label: "Last name", defaultValue: employee.last_name, required: true },
    {
      name: "gender", label: "Gender", type: "select", emptyOption: "Not specified",
      options: [{ value: "male", label: "Male" }, { value: "female", label: "Female" }],
      defaultValue: employee.gender ?? "",
    },
    { name: "date_of_birth", label: "Date of birth", type: "date", defaultValue: employee.date_of_birth },
    { name: "phone", label: "Phone", defaultValue: employee.phone },
    { name: "personal_email", label: "Personal email", defaultValue: employee.personal_email },
    { name: "work_email", label: "Work email", defaultValue: employee.work_email },
    { name: "national_id", label: "National ID (NIDA)", defaultValue: employee.national_id },
    { name: "tin", label: "TIN", defaultValue: employee.tin },
    { name: "nssf_number", label: "NSSF number", defaultValue: employee.nssf_number },
    { name: "physical_address", label: "Address", defaultValue: employee.physical_address },
    {
      name: "status", label: "Status", type: "select",
      options: ["onboarding", "probation", "active", "suspended", "on_leave", "exiting", "exited"]
        .map((s) => ({ value: s, label: s.replace(/_/g, " ") })),
      defaultValue: employee.status,
    },
  ];

  const actionFields: FieldDef[] = [
    { name: "employee_id", type: "hidden", label: "", defaultValue: id },
    { name: "action_type", label: "Action type", type: "select", options: ACTION_TYPE_OPTIONS, required: true },
    { name: "effective_date", label: "Effective date", type: "date", required: true },
    { name: "position_id", label: "New position (optional)", type: "select", options: positionOptions, emptyOption: "No change" },
    { name: "department_id", label: "New department (optional)", type: "select", options: departmentOptions, emptyOption: "No change" },
    { name: "branch_id", label: "New branch (optional)", type: "select", options: branchOptions, emptyOption: "No change" },
    { name: "manager_employee_id", label: "New manager (optional)", type: "select", options: managerOptions, emptyOption: "No change" },
    { name: "basic_salary", label: "New basic salary (optional)", type: "number", step: "0.01" },
    { name: "reason", label: "Reason" },
  ];

  const contractFields = (c?: Record<string, unknown>): FieldDef[] => [
    ...(c ? [{ name: "id", type: "hidden" as const, label: "", defaultValue: c.id as string }] : []),
    { name: "employee_id", type: "hidden", label: "", defaultValue: id },
    {
      name: "contract_type", label: "Contract type", type: "select",
      options: ["permanent", "fixed_term", "part_time", "casual", "internship", "consultancy"]
        .map((t) => ({ value: t, label: t.replace(/_/g, " ") })),
      defaultValue: (c?.contract_type as string) ?? employee.employment_type,
    },
    { name: "starts_on", label: "Start date", type: "date", defaultValue: c?.starts_on as string, required: true },
    { name: "ends_on", label: "End date (blank = open)", type: "date", defaultValue: c?.ends_on as string },
    { name: "probation_months", label: "Probation (months)", type: "number", defaultValue: c?.probation_months as number },
    {
      name: "status", label: "Status", type: "select",
      options: ["draft", "pending_signature", "signed", "active", "expired", "terminated"]
        .map((s) => ({ value: s, label: s.replace(/_/g, " ") })),
      defaultValue: (c?.status as string) ?? "draft",
    },
  ];

  const bankFields = (b?: Record<string, unknown>): FieldDef[] => [
    ...(b ? [{ name: "id", type: "hidden" as const, label: "", defaultValue: b.id as string }] : []),
    { name: "employee_id", type: "hidden", label: "", defaultValue: id },
    {
      name: "payment_method", label: "Payment method", type: "select",
      options: [
        { value: "bank", label: "Bank" },
        { value: "mobile_money", label: "Mobile money" },
        { value: "cash", label: "Cash" },
      ],
      defaultValue: (b?.payment_method as string) ?? "bank",
    },
    { name: "bank_name", label: "Bank name", defaultValue: b?.bank_name as string },
    { name: "bank_branch", label: "Bank branch", defaultValue: b?.bank_branch as string },
    { name: "account_name", label: "Account name", defaultValue: b?.account_name as string },
    { name: "account_number", label: "Account number", defaultValue: b?.account_number as string },
    { name: "mobile_money_provider", label: "Mobile money provider", defaultValue: b?.mobile_money_provider as string, placeholder: "M-Pesa, Tigo Pesa, Airtel Money…" },
    { name: "mobile_money_number", label: "Mobile money number", defaultValue: b?.mobile_money_number as string },
    { name: "split_percentage", label: "Split % of net pay", type: "number", defaultValue: (b?.split_percentage as number) ?? 100 },
    {
      name: "is_primary", label: "Primary account", type: "select",
      options: [{ value: "true", label: "Yes" }, { value: "false", label: "No" }],
      defaultValue: String(b?.is_primary ?? true),
    },
  ];

  const dependantFields = (d?: Record<string, unknown>): FieldDef[] => [
    ...(d ? [{ name: "id", type: "hidden" as const, label: "", defaultValue: d.id as string }] : []),
    { name: "employee_id", type: "hidden", label: "", defaultValue: id },
    { name: "full_name", label: "Full name", defaultValue: d?.full_name as string, required: true },
    {
      name: "relationship", label: "Relationship", type: "select",
      options: ["spouse", "child", "parent", "sibling", "other"].map((r) => ({ value: r, label: r })),
      defaultValue: (d?.relationship as string) ?? "child",
    },
    { name: "date_of_birth", label: "Date of birth", type: "date", defaultValue: d?.date_of_birth as string },
    { name: "phone", label: "Phone", defaultValue: d?.phone as string },
    {
      name: "is_emergency_contact", label: "Emergency contact", type: "select",
      options: [{ value: "false", label: "No" }, { value: "true", label: "Yes" }],
      defaultValue: String(d?.is_emergency_contact ?? false),
    },
  ];

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-semibold tracking-tight">{fullName(employee)}</h1>
            <Badge variant={employee.status === "active" ? "default" : "secondary"}>
              {employee.status.replace(/_/g, " ")}
            </Badge>
          </div>
          <p className="font-mono text-xs text-muted-foreground">
            {employee.employee_number} · hired {employee.hire_date} ·{" "}
            {employee.employment_type.replace(/_/g, " ")}
          </p>
        </div>
        <div className="flex gap-2">
          {!employee.user_id && (
            <OrgFormDialog
              action={generateInvite}
              description="Creates a one-time link (valid 14 days). Share it via WhatsApp, SMS or print — the employee sets a password and lands in self-service."
              fields={[{ name: "employee_id", type: "hidden", label: "", defaultValue: id }]}
              submitLabel="Generate invite link"
              title="Invite to portal"
              triggerLabel="Invite to portal"
              triggerVariant="outline"
            />
          )}
          <OrgFormDialog
            action={updateEmployeePersonal}
            fields={personalFields}
            title="Edit personal details"
            triggerLabel="Edit details"
            triggerVariant="outline"
          />
          <OrgFormDialog
            action={createEmploymentAction}
            description="Approved actions close the current effective-dated record and open a new one — history is never overwritten."
            fields={actionFields}
            submitLabel="Approve & effect"
            title="New employment action"
            triggerLabel="New action"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Section title="Current placement">
          <div className="grid grid-cols-2 gap-4">
            <Info label="Position" value={currentAssignment?.positions?.title} />
            <Info label="Department" value={currentAssignment?.departments?.name} />
            <Info label="Branch" value={currentAssignment?.branches?.name} />
            <Info
              label="Manager"
              value={manager ? `${manager.first_name} ${manager.last_name}` : undefined}
            />
          </div>
        </Section>
        <Section title="Compensation">
          <div className="grid grid-cols-2 gap-4">
            <Info
              label="Basic salary (monthly)"
              value={currentComp ? formatMoney(currentComp.basic_salary, currentComp.currency) : undefined}
            />
            <Info label="Pay frequency" value={currentComp?.pay_frequency} />
            <Info label="Effective from" value={currentComp?.effective_from} />
          </div>
        </Section>
      </div>

      <Section title={`Employment history (${detail.actions.length} actions)`}>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Action</TableHead>
              <TableHead>Effective</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Reason</TableHead>
              <TableHead className="w-20" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {detail.actions.length === 0 && (
              <TableRow><TableCell className="text-muted-foreground" colSpan={5}>No actions recorded.</TableCell></TableRow>
            )}
            {(detail.actions as Array<Record<string, unknown>>).map((a) => (
              <TableRow key={a.id as string}>
                <TableCell className="font-medium">{(a.action_type as string).replace(/_/g, " ")}</TableCell>
                <TableCell className="font-mono text-xs">{a.effective_date as string}</TableCell>
                <TableCell><Badge variant="secondary">{a.status as string}</Badge></TableCell>
                <TableCell className="text-muted-foreground">{(a.reason as string) ?? "—"}</TableCell>
                <TableCell>
                  <Link
                    className="text-xs underline underline-offset-2 hover:text-foreground"
                    href={`/dashboard/people/employees/${id}/letter/${a.id}`}
                  >
                    Letter
                  </Link>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Section>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Section title="Assignment history">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Period</TableHead>
                <TableHead>Position</TableHead>
                <TableHead>Department</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(detail.assignments as Array<Record<string, unknown>>).map((a) => (
                <TableRow key={a.id as string}>
                  <TableCell className="font-mono text-xs">
                    {a.effective_from as string} → {(a.effective_to as string) ?? "present"}
                  </TableCell>
                  <TableCell>{(a.positions as { title?: string } | null)?.title ?? "—"}</TableCell>
                  <TableCell>{(a.departments as { name?: string } | null)?.name ?? "—"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Section>
        <Section title="Salary history">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Period</TableHead>
                <TableHead className="text-right">Basic salary</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {detail.compensation.map((c) => (
                <TableRow key={c.id}>
                  <TableCell className="font-mono text-xs">
                    {c.effective_from} → {c.effective_to ?? "present"}
                  </TableCell>
                  <TableCell className="text-right font-mono text-xs">
                    {formatMoney(c.basic_salary, c.currency)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Section>
      </div>

      <Section
        action={
          <OrgFormDialog
            action={saveContract}
            fields={contractFields()}
            submitLabel="Add contract"
            title="New contract"
            triggerLabel="Add contract"
            triggerVariant="outline"
          />
        }
        title={`Contracts (${detail.contracts.length})`}
      >
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Type</TableHead>
              <TableHead>Period</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Expiry</TableHead>
              <TableHead className="w-16" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {detail.contracts.length === 0 && (
              <TableRow><TableCell className="text-muted-foreground" colSpan={5}>No contracts recorded.</TableCell></TableRow>
            )}
            {(detail.contracts as Array<Record<string, unknown>>).map((c) => {
              const days = daysUntil(c.ends_on as string | null);
              return (
                <TableRow key={c.id as string}>
                  <TableCell>{(c.contract_type as string).replace(/_/g, " ")}</TableCell>
                  <TableCell className="font-mono text-xs">
                    {c.starts_on as string} → {(c.ends_on as string) ?? "open"}
                  </TableCell>
                  <TableCell><Badge variant="secondary">{(c.status as string).replace(/_/g, " ")}</Badge></TableCell>
                  <TableCell>
                    {days === null ? "—" : days < 0 ? (
                      <Badge variant="destructive">expired</Badge>
                    ) : days <= 60 ? (
                      <Badge variant="destructive">{days}d left</Badge>
                    ) : (
                      <span className="font-mono text-xs">{days}d</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <OrgFormDialog
                      action={saveContract}
                      fields={contractFields(c)}
                      title="Edit contract"
                      triggerLabel="Edit"
                      triggerVariant="ghost"
                    />
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </Section>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Section
          action={
            <OrgFormDialog
              action={saveBankAccount}
              fields={bankFields()}
              submitLabel="Add account"
              title="New payment account"
              triggerLabel="Add"
              triggerVariant="outline"
            />
          }
          title={`Payment accounts (${detail.banks.length})`}
        >
          <div className="flex flex-col gap-2">
            {detail.banks.length === 0 && (
              <p className="text-sm text-muted-foreground">No payment accounts.</p>
            )}
            {(detail.banks as Array<Record<string, unknown>>).map((b) => (
              <div className="flex items-center justify-between rounded-lg border p-3" key={b.id as string}>
                <div>
                  <p className="text-sm font-medium">
                    {b.payment_method === "mobile_money"
                      ? `${b.mobile_money_provider ?? "Mobile money"} · ${b.mobile_money_number}`
                      : b.payment_method === "cash"
                        ? "Cash"
                        : `${b.bank_name ?? "Bank"} · ${b.account_number}`}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {b.is_primary ? "Primary" : "Secondary"} · {String(b.split_percentage)}% of net
                  </p>
                </div>
                <OrgFormDialog
                  action={saveBankAccount}
                  fields={bankFields(b)}
                  title="Edit payment account"
                  triggerLabel="Edit"
                  triggerVariant="ghost"
                />
              </div>
            ))}
          </div>
        </Section>

        <Section
          action={
            <OrgFormDialog
              action={saveDependant}
              fields={dependantFields()}
              submitLabel="Add dependant"
              title="New dependant"
              triggerLabel="Add"
              triggerVariant="outline"
            />
          }
          title={`Dependants & emergency contacts (${detail.dependants.length})`}
        >
          <div className="flex flex-col gap-2">
            {detail.dependants.length === 0 && (
              <p className="text-sm text-muted-foreground">No dependants recorded.</p>
            )}
            {(detail.dependants as Array<Record<string, unknown>>).map((d) => (
              <div className="flex items-center justify-between rounded-lg border p-3" key={d.id as string}>
                <div>
                  <p className="text-sm font-medium">{d.full_name as string}</p>
                  <p className="text-xs text-muted-foreground">
                    {d.relationship as string}
                    {d.is_emergency_contact ? " · emergency contact" : ""}
                    {d.phone ? ` · ${d.phone}` : ""}
                  </p>
                </div>
                <OrgFormDialog
                  action={saveDependant}
                  fields={dependantFields(d)}
                  title="Edit dependant"
                  triggerLabel="Edit"
                  triggerVariant="ghost"
                />
              </div>
            ))}
          </div>
        </Section>
      </div>

      <Section title={`Documents (${detail.documents.length})`}>
        <div className="flex flex-col gap-4">
          <DocumentUpload employeeId={id} />
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Category</TableHead>
                <TableHead>Expiry</TableHead>
                <TableHead>Uploaded</TableHead>
                <TableHead className="w-24" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {detail.documents.length === 0 && (
                <TableRow><TableCell className="text-muted-foreground" colSpan={5}>No documents uploaded.</TableCell></TableRow>
              )}
              {(detail.documents as Array<Record<string, unknown>>).map((doc) => {
                const days = daysUntil(doc.expiry_date as string | null);
                return (
                  <TableRow key={doc.id as string}>
                    <TableCell className="font-medium">{doc.name as string}</TableCell>
                    <TableCell>
                      <Badge variant="outline">{(doc.category as string).replace(/_/g, " ")}</Badge>
                    </TableCell>
                    <TableCell>
                      {days === null ? "—" : days < 0 ? (
                        <Badge variant="destructive">expired</Badge>
                      ) : days <= 60 ? (
                        <Badge variant="destructive">{days}d left</Badge>
                      ) : (
                        <span className="font-mono text-xs">{doc.expiry_date as string}</span>
                      )}
                    </TableCell>
                    <TableCell className="font-mono text-xs">
                      {new Date(doc.created_at as string).toISOString().slice(0, 10)}
                    </TableCell>
                    <TableCell>
                      {signedUrls.has(doc.id as string) && (
                        <a
                          className="text-xs underline underline-offset-2 hover:text-foreground"
                          href={signedUrls.get(doc.id as string)}
                          rel="noreferrer"
                          target="_blank"
                        >
                          Download
                        </a>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      </Section>
    </div>
  );
}

import type { Metadata } from "next";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getTenancyContext } from "@/lib/tenancy/context";
import { getUserPermissions } from "@/lib/authz";
import {
  openRequest,
  replyToRequest,
  updateRequestStatus,
} from "@/app/dashboard/experience/service-desk/actions";
import { OrgFormDialog, type FieldDef } from "@/components/org/org-form-dialog";
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

export const metadata: Metadata = { title: "HR service desk — Stellix" };

const CATEGORIES = [
  { value: "payslip_issue", label: "Payslip issue" },
  { value: "leave_dispute", label: "Leave balance dispute" },
  { value: "bank_change", label: "Bank detail change" },
  { value: "letter_request", label: "Employment letter request" },
  { value: "contract_question", label: "Contract question" },
  { value: "benefit_enquiry", label: "Benefit enquiry" },
  { value: "complaint", label: "Workplace complaint" },
  { value: "other", label: "Other" },
];

const STATUS_VARIANT: Record<string, "default" | "secondary" | "outline" | "destructive"> = {
  open: "secondary",
  in_progress: "default",
  resolved: "outline",
  closed: "outline",
};

export default async function ServiceDeskPage({
  searchParams,
}: {
  searchParams: Promise<{ request?: string }>;
}) {
  const { request: selectedId } = await searchParams;
  const supabase = await createClient();
  const context = await getTenancyContext();
  const permissions = context?.activeTenant
    ? await getUserPermissions(supabase, context.activeTenant.id, context.user.id)
    : new Set<string>();
  const isAgent = permissions.has("experience.desk.agent");

  const { data: requests } = await supabase
    .from("service_requests")
    .select("*, employees(first_name, last_name, employee_number)")
    .order("created_at", { ascending: false })
    .limit(100);

  const selected = (requests ?? []).find((r) => r.id === selectedId);
  const { data: messages } = selected
    ? await supabase
        .from("service_request_messages")
        .select("*")
        .eq("request_id", selected.id)
        .order("created_at")
    : { data: [] };

  const newRequestFields: FieldDef[] = [
    { name: "subject", label: "Subject", required: true, placeholder: "e.g. My June payslip is missing an allowance" },
    { name: "category", label: "Category", type: "select", options: CATEGORIES },
    { name: "description", label: "Describe the issue" },
    {
      name: "priority", label: "Priority", type: "select",
      options: [
        { value: "normal", label: "Normal" },
        { value: "low", label: "Low" },
        { value: "high", label: "High" },
      ],
    },
    {
      name: "confidential", label: "Confidential", type: "select",
      options: [
        { value: "false", label: "No" },
        { value: "true", label: "Yes — restrict to HR agents" },
      ],
    },
  ];

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">HR service desk</h1>
          <p className="text-sm text-muted-foreground">
            {isAgent
              ? `Agent view — ${(requests ?? []).filter((r) => ["open", "in_progress"].includes(r.status)).length} open`
              : "Raise requests to HR and track replies"}
          </p>
        </div>
        <OrgFormDialog
          action={openRequest}
          fields={newRequestFields}
          submitLabel="Open request"
          title="New HR request"
          triggerLabel="New request"
        />
      </div>

      <div className={`grid grid-cols-1 gap-4 ${selected ? "lg:grid-cols-2" : ""}`}>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Subject</TableHead>
              <TableHead>Category</TableHead>
              <TableHead>Priority</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {(requests ?? []).length === 0 && (
              <TableRow>
                <TableCell className="text-muted-foreground" colSpan={4}>
                  No requests yet.
                </TableCell>
              </TableRow>
            )}
            {(requests ?? []).map((r) => (
              <TableRow key={r.id}>
                <TableCell className="font-medium">
                  <Link className="hover:underline" href={`?request=${r.id}`}>
                    {r.subject}
                  </Link>
                  {r.confidential && (
                    <Badge className="ml-2" variant="outline">confidential</Badge>
                  )}
                </TableCell>
                <TableCell className="text-xs">{String(r.category).replace(/_/g, " ")}</TableCell>
                <TableCell>
                  <Badge variant={r.priority === "high" ? "destructive" : "outline"}>
                    {r.priority}
                  </Badge>
                </TableCell>
                <TableCell>
                  <Badge variant={STATUS_VARIANT[r.status] ?? "outline"}>
                    {String(r.status).replace(/_/g, " ")}
                  </Badge>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>

        {selected && (
          <Card className="shadow-none">
            <CardHeader className="flex flex-row items-start justify-between">
              <div>
                <CardTitle>{selected.subject}</CardTitle>
                <p className="text-xs text-muted-foreground">
                  {String(selected.category).replace(/_/g, " ")} ·{" "}
                  {(selected.employees as { first_name?: string; last_name?: string } | null)
                    ? `${(selected.employees as { first_name?: string }).first_name} ${(selected.employees as { last_name?: string }).last_name}`
                    : "no employee record"}{" "}
                  · opened {String(selected.created_at).slice(0, 10)}
                </p>
              </div>
              {isAgent && (
                <OrgFormDialog
                  action={updateRequestStatus}
                  fields={[
                    { name: "request_id", type: "hidden", label: "", defaultValue: selected.id },
                    {
                      name: "status", label: "New status", type: "select", required: true,
                      options: [
                        { value: "in_progress", label: "In progress" },
                        { value: "resolved", label: "Resolved" },
                        { value: "closed", label: "Closed" },
                        { value: "open", label: "Reopen" },
                      ],
                    },
                  ]}
                  submitLabel="Update"
                  title="Update request status"
                  triggerLabel="Set status"
                  triggerVariant="outline"
                />
              )}
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              {selected.description && (
                <p className="rounded-md border p-3 text-sm">{selected.description}</p>
              )}
              <div className="flex flex-col gap-2">
                {(messages ?? []).map((m) => (
                  <div
                    className={`rounded-md border p-3 text-sm ${m.is_internal ? "border-dashed bg-muted/40" : ""}`}
                    key={m.id}
                  >
                    {m.is_internal && (
                      <Badge className="mb-1" variant="outline">internal note</Badge>
                    )}
                    <p>{m.body}</p>
                    <p className="mt-1 font-mono text-[10px] text-muted-foreground">
                      {String(m.created_at).slice(0, 16).replace("T", " ")}
                    </p>
                  </div>
                ))}
              </div>
              <OrgFormDialog
                action={replyToRequest}
                fields={[
                  { name: "request_id", type: "hidden", label: "", defaultValue: selected.id },
                  { name: "body", label: "Message", required: true },
                  ...(isAgent
                    ? [{
                        name: "is_internal", label: "Visibility", type: "select" as const,
                        options: [
                          { value: "false", label: "Visible to employee" },
                          { value: "true", label: "Internal note (agents only)" },
                        ],
                      }]
                    : []),
                ]}
                submitLabel="Send reply"
                title="Reply"
                triggerLabel="Reply"
              />
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}

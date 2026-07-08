import type { Metadata } from "next";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { savePolicy } from "@/app/dashboard/settings/policies/actions";
import { OrgFormDialog, type FieldDef } from "@/components/org/org-form-dialog";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export const metadata: Metadata = { title: "Company policies — Stellix" };

const CATEGORIES = ["general", "leave", "attendance", "payroll", "conduct", "benefits", "safety"]
  .map((c) => ({ value: c, label: c }));

export default async function PoliciesPage() {
  const supabase = await createClient();
  const { data: policies } = await supabase
    .from("company_policies")
    .select("*")
    .order("category")
    .order("title");

  const policyFields = (p?: Record<string, unknown>): FieldDef[] => [
    ...(p ? [{ name: "id", type: "hidden" as const, label: "", defaultValue: p.id as string }] : []),
    { name: "title", label: "Policy title", defaultValue: p?.title as string, required: true, placeholder: "e.g. Annual leave policy" },
    { name: "category", label: "Category", type: "select", options: CATEGORIES, defaultValue: (p?.category as string) ?? "general" },
    { name: "body", label: "Policy text (this is what the AI answers from)", type: "textarea", defaultValue: p?.body as string, required: true },
    {
      name: "is_active", label: "Status", type: "select",
      options: [
        { value: "true", label: "Active (used by the assistant)" },
        { value: "false", label: "Inactive" },
      ],
      defaultValue: String(p?.is_active ?? true),
    },
  ];

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Company policies</h1>
          <p className="text-sm text-muted-foreground">
            The knowledge base behind the{" "}
            <Link className="underline underline-offset-2" href="/dashboard/ai">
              policy assistant
            </Link>{" "}
            — it answers strictly from these texts.
          </p>
        </div>
        <OrgFormDialog
          action={savePolicy}
          fields={policyFields()}
          submitLabel="Publish policy"
          title="New policy"
          triggerLabel="New policy"
        />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {(policies ?? []).length === 0 && (
          <p className="text-sm text-muted-foreground">
            No policies yet. Publish your leave, attendance and conduct
            policies so employees can ask questions about them.
          </p>
        )}
        {(policies ?? []).map((policy) => (
          <Card className="shadow-none" key={policy.id}>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle>{policy.title}</CardTitle>
                <div className="mt-1 flex gap-1">
                  <Badge variant="outline">{policy.category}</Badge>
                  {!policy.is_active && <Badge variant="destructive">inactive</Badge>}
                </div>
              </div>
              <OrgFormDialog
                action={savePolicy}
                fields={policyFields(policy)}
                title={`Edit ${policy.title}`}
                triggerLabel="Edit"
                triggerVariant="ghost"
              />
            </CardHeader>
            <CardContent>
              <p className="line-clamp-4 whitespace-pre-wrap text-sm text-muted-foreground">
                {policy.body}
              </p>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

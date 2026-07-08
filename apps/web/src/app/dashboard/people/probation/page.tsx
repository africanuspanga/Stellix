import type { Metadata } from "next";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { daysUntil, fullName, getEmployees } from "@/lib/people/queries";
import { completeReview, scheduleReview } from "@/app/dashboard/people/probation/actions";
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

export const metadata: Metadata = { title: "Probation — Stellix" };

export default async function ProbationPage() {
  const supabase = await createClient();
  const [employees, { data: reviews }] = await Promise.all([
    getEmployees(supabase),
    supabase
      .from("probation_reviews")
      .select("*, employees(id, first_name, middle_name, last_name, employee_number)")
      .order("review_date"),
  ]);

  const { data: probationers } = await supabase
    .from("employees")
    .select("id, first_name, middle_name, last_name, employee_number, hire_date, probation_end_date, status")
    .or("status.eq.probation,probation_end_date.not.is.null")
    .order("probation_end_date", { ascending: true, nullsFirst: false });

  const scheduled = (reviews ?? []).filter((r) => r.status === "scheduled");
  const overdue = scheduled.filter((r) => (daysUntil(r.review_date) ?? 0) < 0);

  const scheduleFields: FieldDef[] = [
    {
      name: "employee_id", label: "Employee", type: "select", required: true,
      options: employees.map((e) => ({ value: e.id, label: `${fullName(e)} (${e.employee_number})` })),
    },
    { name: "review_date", label: "Review date", type: "date", required: true },
  ];

  const completeFields = (reviewId: string): FieldDef[] => [
    { name: "id", type: "hidden", label: "", defaultValue: reviewId },
    { name: "manager_feedback", label: "Manager feedback" },
    { name: "employee_feedback", label: "Employee feedback" },
    {
      name: "recommendation", label: "Recommendation", type: "select", required: true,
      options: [
        { value: "confirm", label: "Confirm employment" },
        { value: "extend", label: "Extend probation" },
        { value: "terminate", label: "Recommend termination" },
      ],
    },
    { name: "new_probation_end_date", label: "New probation end date (for extension)", type: "date" },
  ];

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Probation</h1>
          <p className="text-sm text-muted-foreground">
            {probationers?.length ?? 0} employees with probation records ·{" "}
            {overdue.length} overdue reviews
          </p>
        </div>
        <OrgFormDialog
          action={scheduleReview}
          fields={scheduleFields}
          submitLabel="Schedule"
          title="Schedule probation review"
          triggerLabel="Schedule review"
        />
      </div>

      {overdue.length > 0 && (
        <Card className="border-destructive/50 shadow-none">
          <CardHeader>
            <CardTitle className="text-destructive">
              Overdue reviews ({overdue.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            {overdue.map((review) => {
              const emp = review.employees as {
                first_name: string; middle_name: string | null; last_name: string;
              } | null;
              return (
                <div className="flex items-center justify-between rounded-md border px-3 py-2" key={review.id}>
                  <p className="text-sm">
                    {emp ? fullName(emp) : "—"} · was due {review.review_date}
                  </p>
                  <OrgFormDialog
                    action={completeReview}
                    fields={completeFields(review.id)}
                    submitLabel="Complete review"
                    title="Complete probation review"
                    triggerLabel="Review now"
                  />
                </div>
              );
            })}
          </CardContent>
        </Card>
      )}

      <section className="flex flex-col gap-3">
        <h2 className="font-medium">On probation</h2>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Employee</TableHead>
              <TableHead>Hired</TableHead>
              <TableHead>Probation ends</TableHead>
              <TableHead>Time left</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {(probationers ?? []).length === 0 && (
              <TableRow>
                <TableCell className="text-muted-foreground" colSpan={5}>
                  No employees on probation.
                </TableCell>
              </TableRow>
            )}
            {(probationers ?? []).map((p) => {
              const days = daysUntil(p.probation_end_date);
              return (
                <TableRow key={p.id}>
                  <TableCell className="font-medium">
                    <Link className="hover:underline" href={`/dashboard/people/employees/${p.id}`}>
                      {fullName(p)}
                    </Link>
                  </TableCell>
                  <TableCell className="font-mono text-xs">{p.hire_date}</TableCell>
                  <TableCell className="font-mono text-xs">{p.probation_end_date ?? "—"}</TableCell>
                  <TableCell>
                    {days === null ? "—" : days < 0 ? (
                      <Badge variant="destructive">ended {-days}d ago</Badge>
                    ) : (
                      <span className="font-mono text-xs">{days}d</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <Badge variant={p.status === "probation" ? "secondary" : "outline"}>
                      {p.status.replace(/_/g, " ")}
                    </Badge>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="font-medium">Reviews</h2>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Employee</TableHead>
              <TableHead>Date</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Recommendation</TableHead>
              <TableHead className="w-32" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {(reviews ?? []).length === 0 && (
              <TableRow>
                <TableCell className="text-muted-foreground" colSpan={5}>
                  No reviews scheduled.
                </TableCell>
              </TableRow>
            )}
            {(reviews ?? []).map((review) => {
              const emp = review.employees as {
                first_name: string; middle_name: string | null; last_name: string;
              } | null;
              return (
                <TableRow key={review.id}>
                  <TableCell className="font-medium">{emp ? fullName(emp) : "—"}</TableCell>
                  <TableCell className="font-mono text-xs">{review.review_date}</TableCell>
                  <TableCell>
                    <Badge variant={review.status === "completed" ? "default" : "secondary"}>
                      {review.status}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {review.recommendation ? (
                      <Badge variant={review.recommendation === "terminate" ? "destructive" : "outline"}>
                        {review.recommendation}
                      </Badge>
                    ) : (
                      "—"
                    )}
                  </TableCell>
                  <TableCell>
                    {review.status === "scheduled" && (
                      <OrgFormDialog
                        action={completeReview}
                        fields={completeFields(review.id)}
                        submitLabel="Complete review"
                        title="Complete probation review"
                        triggerLabel="Complete"
                        triggerVariant="outline"
                      />
                    )}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </section>
    </div>
  );
}

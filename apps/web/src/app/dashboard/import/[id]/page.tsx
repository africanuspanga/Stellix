import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getLegalEntities } from "@/lib/org/queries";
import { EMPLOYEE_IMPORT_FIELDS } from "@/lib/imports/employees";
import { MappingForm, RunImportForm } from "@/components/imports/import-forms";
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

export const metadata: Metadata = { title: "Import — Stellix" };

function Step({ n, label, active, done }: { n: number; label: string; active: boolean; done: boolean }) {
  return (
    <div className="flex items-center gap-2">
      <span
        className={`flex size-6 items-center justify-center rounded-full text-xs font-medium ${
          done ? "bg-foreground text-background" : active ? "border-2 border-foreground" : "border text-muted-foreground"
        }`}
      >
        {n}
      </span>
      <span className={`text-sm ${active || done ? "" : "text-muted-foreground"}`}>{label}</span>
    </div>
  );
}

export default async function ImportDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ step?: string }>;
}) {
  const { id } = await params;
  const { step } = await searchParams;
  const supabase = await createClient();
  const { data: imp } = await supabase.from("imports").select("*").eq("id", id).maybeSingle();
  if (!imp) notFound();
  const entities = await getLegalEntities(supabase);

  const headers = imp.headers as string[];
  const rows = imp.rows as string[][];
  const mapping = imp.mapping as Record<string, number>;
  const errors = (imp.errors ?? []) as Array<{ row: number; message: string }>;
  const summary = imp.summary as { created: number; failed: Array<{ row: number; message: string }> } | null;

  const showMapping = imp.status === "uploaded" || step === "map";
  const showValidation = imp.status === "validated" && step !== "map";
  const showResult = imp.status === "imported";

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">{imp.file_name}</h1>
          <p className="font-mono text-xs text-muted-foreground">
            {imp.total_rows} rows detected · {headers.length} columns
          </p>
        </div>
        <Link className="text-sm underline underline-offset-2" href="/dashboard/import">
          ← All imports
        </Link>
      </div>

      <div className="flex flex-wrap gap-6 rounded-xl border p-4">
        <Step active={showMapping} done={imp.status !== "uploaded"} label="Map columns" n={1} />
        <Step active={showValidation} done={showResult} label="Validate & dry run" n={2} />
        <Step active={false} done={showResult} label="Import & reconcile" n={3} />
      </div>

      {showMapping && (
        <Card className="shadow-none">
          <CardHeader>
            <CardTitle>Map file columns to employee fields</CardTitle>
          </CardHeader>
          <CardContent>
            <MappingForm
              fields={EMPLOYEE_IMPORT_FIELDS.map((f) => ({
                key: f.key,
                label: f.label,
                required: f.required,
                selected: mapping[f.key],
              }))}
              headers={headers}
              importId={id}
            />
          </CardContent>
        </Card>
      )}

      {showValidation && (
        <>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
            <Card className="shadow-none">
              <CardHeader>
                <CardTitle className="font-mono text-2xl">{imp.total_rows}</CardTitle>
                <p className="text-xs text-muted-foreground">rows in file</p>
              </CardHeader>
            </Card>
            <Card className="shadow-none">
              <CardHeader>
                <CardTitle className="font-mono text-2xl">{imp.valid_rows}</CardTitle>
                <p className="text-xs text-muted-foreground">valid (will import)</p>
              </CardHeader>
            </Card>
            <Card className="shadow-none">
              <CardHeader>
                <CardTitle className="font-mono text-2xl">{errors.length}</CardTitle>
                <p className="text-xs text-muted-foreground">rows with errors (skipped)</p>
              </CardHeader>
            </Card>
          </div>

          <RunImportForm
            entities={entities.map((e) => ({ value: e.id, label: e.name }))}
            importId={id}
            validRows={imp.valid_rows}
          />

          <Link
            className="text-sm text-muted-foreground underline underline-offset-2"
            href={`/dashboard/import/${id}?step=map`}
          >
            ← Back to column mapping
          </Link>
        </>
      )}

      {showResult && summary && (
        <div className="flex flex-col gap-4">
          <div className="flex items-center gap-3 rounded-xl border p-4">
            <Badge>imported</Badge>
            <p className="text-sm">
              <strong>{summary.created}</strong> employees created,{" "}
              <strong>{errors.length - (summary.failed?.length ?? 0)}</strong>{" "}
              rows skipped in validation, <strong>{summary.failed?.length ?? 0}</strong> failed during import.
            </p>
            <Link className="ml-auto text-sm underline underline-offset-2" href="/dashboard/people/employees">
              View employees →
            </Link>
          </div>
        </div>
      )}

      {(showValidation || showResult) && errors.length > 0 && (
        <Card className="shadow-none">
          <CardHeader>
            <CardTitle>Error report ({errors.length})</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-20">Row</TableHead>
                  <TableHead>Problem</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {errors.slice(0, 100).map((e, i) => (
                  <TableRow key={`${e.row}-${i}`}>
                    <TableCell className="font-mono text-xs">{e.row}</TableCell>
                    <TableCell className="text-sm">{e.message}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {showMapping && rows.length > 0 && (
        <Card className="shadow-none">
          <CardHeader>
            <CardTitle>File preview (first 5 rows)</CardTitle>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  {headers.map((h, i) => (
                    <TableHead key={i}>{h || `Col ${i + 1}`}</TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.slice(0, 5).map((row, i) => (
                  <TableRow key={i}>
                    {row.map((cell, j) => (
                      <TableCell className="text-xs" key={j}>
                        {cell}
                      </TableCell>
                    ))}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

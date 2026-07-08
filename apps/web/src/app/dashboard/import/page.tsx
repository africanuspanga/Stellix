import type { Metadata } from "next";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { UploadForm } from "@/components/imports/import-forms";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export const metadata: Metadata = { title: "Import centre — Stellix" };

const STATUS_VARIANT: Record<string, "default" | "secondary" | "outline" | "destructive"> = {
  imported: "default",
  validated: "secondary",
  uploaded: "outline",
  failed: "destructive",
};

export default async function ImportCentrePage() {
  const supabase = await createClient();
  const { data: imports } = await supabase
    .from("imports")
    .select("id, file_name, import_type, status, total_rows, valid_rows, created_at")
    .order("created_at", { ascending: false })
    .limit(50);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Import centre</h1>
        <p className="text-sm text-muted-foreground">
          Upload → map columns → validate → dry run → import → reconcile.
          Employee imports support personal details, employment terms, salary
          and payment accounts.
        </p>
      </div>
      <UploadForm />
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>File</TableHead>
            <TableHead>Type</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="text-right">Rows</TableHead>
            <TableHead className="text-right">Valid</TableHead>
            <TableHead>Date</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {(imports ?? []).length === 0 && (
            <TableRow>
              <TableCell className="text-muted-foreground" colSpan={6}>
                No imports yet. Upload your first employee file above.
              </TableCell>
            </TableRow>
          )}
          {(imports ?? []).map((imp) => (
            <TableRow key={imp.id}>
              <TableCell className="font-medium">
                <Link className="hover:underline" href={`/dashboard/import/${imp.id}`}>
                  {imp.file_name}
                </Link>
              </TableCell>
              <TableCell>{imp.import_type}</TableCell>
              <TableCell>
                <Badge variant={STATUS_VARIANT[imp.status] ?? "outline"}>{imp.status}</Badge>
              </TableCell>
              <TableCell className="text-right font-mono text-xs">{imp.total_rows}</TableCell>
              <TableCell className="text-right font-mono text-xs">{imp.valid_rows}</TableCell>
              <TableCell className="font-mono text-xs">
                {new Date(imp.created_at).toISOString().slice(0, 10)}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

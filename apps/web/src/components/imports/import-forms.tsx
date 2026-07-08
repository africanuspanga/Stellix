"use client";

import { useActionState } from "react";
import {
  createImport,
  executeImport,
  saveMappingAndValidate,
  type ImportFormState,
} from "@/app/dashboard/import/actions";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const selectClass =
  "border-input h-9 w-full rounded-md border bg-transparent px-3 text-sm shadow-xs outline-none focus-visible:ring-2 focus-visible:ring-ring";

export function UploadForm() {
  const [state, action, pending] = useActionState<ImportFormState, FormData>(
    createImport,
    {},
  );
  return (
    <form
      action={action}
      className="flex flex-col gap-3 rounded-xl border border-dashed p-4"
    >
      {state.error && (
        <Alert variant="destructive">
          <AlertDescription>{state.error}</AlertDescription>
        </Alert>
      )}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="flex flex-col gap-1.5 sm:col-span-2">
          <Label htmlFor="file">CSV or Excel file (first row = headers, max 1000 rows)</Label>
          <Input accept=".csv,.xlsx,.xls" id="file" name="file" required type="file" />
        </div>
        <div className="flex items-end">
          <Button className="w-full" disabled={pending} type="submit">
            {pending ? "Parsing…" : "Upload & detect columns"}
          </Button>
        </div>
      </div>
    </form>
  );
}

export interface MappingField {
  key: string;
  label: string;
  required?: boolean;
  selected?: number;
}

export function MappingForm({
  importId,
  headers,
  fields,
}: {
  importId: string;
  headers: string[];
  fields: MappingField[];
}) {
  const [state, action, pending] = useActionState<ImportFormState, FormData>(
    saveMappingAndValidate,
    {},
  );
  return (
    <form action={action} className="flex flex-col gap-4">
      {state.error && (
        <Alert variant="destructive">
          <AlertDescription>{state.error}</AlertDescription>
        </Alert>
      )}
      <input name="id" type="hidden" value={importId} />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {fields.map((field) => (
          <div className="flex flex-col gap-1.5" key={field.key}>
            <Label htmlFor={`map_${field.key}`}>
              {field.label}
              {field.required && <span className="text-destructive"> *</span>}
            </Label>
            <select
              className={selectClass}
              defaultValue={field.selected === undefined ? "" : String(field.selected)}
              id={`map_${field.key}`}
              name={`map_${field.key}`}
            >
              <option value="">— not in file —</option>
              {headers.map((header, index) => (
                <option key={index} value={index}>
                  {header || `Column ${index + 1}`}
                </option>
              ))}
            </select>
          </div>
        ))}
      </div>
      <div>
        <Button disabled={pending} type="submit">
          {pending ? "Validating…" : "Validate mapping"}
        </Button>
      </div>
    </form>
  );
}

export function RunImportForm({
  importId,
  validRows,
  entities,
}: {
  importId: string;
  validRows: number;
  entities: Array<{ value: string; label: string }>;
}) {
  const [state, action, pending] = useActionState<ImportFormState, FormData>(
    executeImport,
    {},
  );
  return (
    <form action={action} className="flex flex-col gap-3 rounded-xl border p-4">
      {state.error && (
        <Alert variant="destructive">
          <AlertDescription>{state.error}</AlertDescription>
        </Alert>
      )}
      <input name="id" type="hidden" value={importId} />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="flex flex-col gap-1.5 sm:col-span-2">
          <Label htmlFor="legal_entity_id">Import into legal entity</Label>
          <select className={selectClass} id="legal_entity_id" name="legal_entity_id" required>
            {entities.map((e) => (
              <option key={e.value} value={e.value}>
                {e.label}
              </option>
            ))}
          </select>
        </div>
        <div className="flex items-end">
          <Button className="w-full" disabled={pending || validRows === 0} type="submit">
            {pending ? "Importing…" : `Import ${validRows} valid rows`}
          </Button>
        </div>
      </div>
      <p className="text-xs text-muted-foreground">
        Rows with errors are skipped and listed in the reconciliation report.
        This action cannot be undone.
      </p>
    </form>
  );
}

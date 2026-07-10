"use client";

import { useActionState } from "react";
import { UploadIcon } from "lucide-react";
import {
  bulkAddRunInputs,
  type RunFormState,
} from "@/app/dashboard/payroll/runs/actions";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

/** Upload a spreadsheet of one-off inputs (bonuses/deductions) for a run.
 *  Columns: employee number, item, type (earning/deduction), amount, taxable. */
export function BulkInputUpload({ runId }: { runId: string }) {
  const [state, action, pending] = useActionState<RunFormState, FormData>(
    bulkAddRunInputs,
    {},
  );

  return (
    <div className="flex flex-col gap-2 rounded-lg border p-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-medium">Bulk inputs from a spreadsheet</p>
          <p className="text-xs text-muted-foreground">
            Columns: <span className="font-mono">employee number, item, type, amount, taxable</span>.
            Type is earning or deduction. Recalculates the run.
          </p>
        </div>
      </div>
      {state.error && (
        <Alert variant="destructive">
          <AlertDescription>{state.error}</AlertDescription>
        </Alert>
      )}
      {state.success && (
        <Alert>
          <AlertDescription>{state.message}</AlertDescription>
        </Alert>
      )}
      <form action={action} className="flex items-center gap-2">
        <input name="run_id" type="hidden" value={runId} />
        <input
          accept=".csv,.xlsx,.xls,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          className="text-xs file:mr-2 file:rounded-md file:border file:bg-background file:px-2 file:py-1 file:text-xs"
          name="file"
          required
          type="file"
        />
        <Button disabled={pending} size="sm" type="submit" variant="outline">
          <UploadIcon />
          {pending ? "Importing…" : "Upload"}
        </Button>
      </form>
    </div>
  );
}

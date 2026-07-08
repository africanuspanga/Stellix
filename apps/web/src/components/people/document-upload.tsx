"use client";

import { useActionState, useEffect, useRef } from "react";
import { uploadDocument, type PeopleFormState } from "@/app/dashboard/people/employees/actions";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const CATEGORIES = [
  { value: "contract", label: "Contract" },
  { value: "id_document", label: "ID document" },
  { value: "certificate", label: "Certificate" },
  { value: "cv", label: "CV" },
  { value: "letter", label: "Letter" },
  { value: "permit", label: "Permit" },
  { value: "other", label: "Other" },
];

export function DocumentUpload({ employeeId }: { employeeId: string }) {
  const [state, action, pending] = useActionState<PeopleFormState, FormData>(
    uploadDocument,
    {},
  );
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.success) formRef.current?.reset();
  }, [state.success]);

  return (
    <form
      action={action}
      className="flex flex-col gap-3 rounded-xl border border-dashed p-4"
      ref={formRef}
    >
      {state.error && (
        <Alert variant="destructive">
          <AlertDescription>{state.error}</AlertDescription>
        </Alert>
      )}
      <input name="employee_id" type="hidden" value={employeeId} />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="file">File (max 10 MB)</Label>
          <Input id="file" name="file" required type="file" />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="category">Category</Label>
          <select
            className="border-input h-9 w-full rounded-md border bg-transparent px-3 text-sm shadow-xs outline-none focus-visible:ring-2 focus-visible:ring-ring"
            id="category"
            name="category"
          >
            {CATEGORIES.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="doc-name">Display name (optional)</Label>
          <Input id="doc-name" name="name" placeholder="e.g. Signed contract 2026" />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="expiry_date">Expiry date (optional)</Label>
          <Input id="expiry_date" name="expiry_date" type="date" />
        </div>
      </div>
      <div>
        <Button disabled={pending} size="sm" type="submit">
          {pending ? "Uploading…" : "Upload document"}
        </Button>
      </div>
    </form>
  );
}

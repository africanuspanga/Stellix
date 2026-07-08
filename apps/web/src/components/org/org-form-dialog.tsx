"use client";

import { useActionState, useEffect, useState } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { OrgFormState } from "@/app/dashboard/organization/actions";

export interface FieldOption {
  value: string;
  label: string;
}

export interface FieldDef {
  name: string;
  label: string;
  type?: "text" | "number" | "select" | "hidden";
  options?: FieldOption[];
  /** For selects: adds a "none" choice with this label mapping to ''. */
  emptyOption?: string;
  defaultValue?: string | number | null;
  placeholder?: string;
  required?: boolean;
  step?: string;
}

const selectClass =
  "border-input h-9 w-full rounded-md border bg-transparent px-3 text-sm shadow-xs outline-none focus-visible:ring-2 focus-visible:ring-ring";

function FormBody({
  action,
  fields,
  submitLabel,
  onSuccess,
}: {
  action: (prev: OrgFormState, formData: FormData) => Promise<OrgFormState>;
  fields: FieldDef[];
  submitLabel: string;
  onSuccess: () => void;
}) {
  const [state, formAction, pending] = useActionState<OrgFormState, FormData>(
    action,
    {},
  );

  useEffect(() => {
    if (state.success) onSuccess();
  }, [state.success, onSuccess]);

  return (
    <form action={formAction} className="flex flex-col gap-4">
      {state.error && (
        <Alert variant="destructive">
          <AlertDescription>{state.error}</AlertDescription>
        </Alert>
      )}
      {fields.map((field) => {
        const value = field.defaultValue ?? "";
        if (field.type === "hidden") {
          return (
            <input
              key={field.name}
              name={field.name}
              type="hidden"
              defaultValue={String(value)}
            />
          );
        }
        return (
          <div className="flex flex-col gap-2" key={field.name}>
            <Label htmlFor={field.name}>{field.label}</Label>
            {field.type === "select" ? (
              <select
                className={selectClass}
                defaultValue={String(value)}
                id={field.name}
                name={field.name}
                required={field.required}
              >
                {field.emptyOption !== undefined && (
                  <option value="">{field.emptyOption}</option>
                )}
                {field.options?.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            ) : (
              <Input
                defaultValue={String(value)}
                id={field.name}
                name={field.name}
                placeholder={field.placeholder}
                required={field.required}
                step={field.step}
                type={field.type ?? "text"}
              />
            )}
          </div>
        );
      })}
      <Button className="mt-2" disabled={pending} type="submit">
        {pending ? "Saving…" : submitLabel}
      </Button>
    </form>
  );
}

export function OrgFormDialog({
  title,
  description,
  triggerLabel,
  triggerVariant = "default",
  triggerSize = "sm",
  action,
  fields,
  submitLabel = "Save",
}: {
  title: string;
  description?: string;
  triggerLabel: string;
  triggerVariant?: "default" | "outline" | "ghost";
  triggerSize?: "sm" | "icon-sm" | "default";
  action: (prev: OrgFormState, formData: FormData) => Promise<OrgFormState>;
  fields: FieldDef[];
  submitLabel?: string;
}) {
  const [open, setOpen] = useState(false);

  return (
    <Dialog onOpenChange={setOpen} open={open}>
      <DialogTrigger
        render={<Button size={triggerSize} variant={triggerVariant} />}
      >
        {triggerLabel}
      </DialogTrigger>
      <DialogContent className="max-h-[85svh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description && <DialogDescription>{description}</DialogDescription>}
        </DialogHeader>
        <FormBody
          action={action}
          fields={fields}
          onSuccess={() => setOpen(false)}
          submitLabel={submitLabel}
        />
      </DialogContent>
    </Dialog>
  );
}

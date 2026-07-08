"use client";

import { useActionState } from "react";
import { SparklesIcon } from "lucide-react";
import type { AiFormState } from "@/app/dashboard/ai/actions";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export interface AssistantOption {
  value: string;
  label: string;
}

const selectClass =
  "border-input h-9 w-full rounded-md border bg-transparent px-3 text-sm shadow-xs outline-none focus-visible:ring-2 focus-visible:ring-ring";

export function AssistantForm({
  action,
  questionLabel,
  questionPlaceholder,
  submitLabel,
  selects = [],
  fixedQuestion = false,
}: {
  action: (prev: AiFormState, f: FormData) => Promise<AiFormState>;
  questionLabel?: string;
  questionPlaceholder?: string;
  submitLabel: string;
  selects?: Array<{ name: string; label: string; options: AssistantOption[] }>;
  fixedQuestion?: boolean;
}) {
  const [state, formAction, pending] = useActionState<AiFormState, FormData>(action, {});

  return (
    <div className="flex flex-col gap-4">
      <form action={formAction} className="flex flex-col gap-3">
        {selects.map((select) => (
          <div className="flex flex-col gap-1.5" key={select.name}>
            <Label htmlFor={select.name}>{select.label}</Label>
            <select className={selectClass} id={select.name} name={select.name} required>
              <option value="">Choose…</option>
              {select.options.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
        ))}
        {!fixedQuestion && (
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="question">{questionLabel ?? "Your question"}</Label>
            <Input
              id="question"
              maxLength={1000}
              name="question"
              placeholder={questionPlaceholder}
              required={selects.length === 0}
            />
          </div>
        )}
        <div>
          <Button disabled={pending} type="submit">
            <SparklesIcon />
            {pending ? "Thinking…" : submitLabel}
          </Button>
        </div>
      </form>

      {state.error && (
        <Alert variant="destructive">
          <AlertDescription>{state.error}</AlertDescription>
        </Alert>
      )}
      {state.answer && (
        <div className="flex flex-col gap-2 rounded-xl border p-4">
          <p className="whitespace-pre-wrap text-sm leading-relaxed">{state.answer}</p>
          {(state.sources ?? []).length > 0 && (
            <div className="flex flex-wrap gap-1 border-t pt-2">
              <span className="text-xs text-muted-foreground">Sources:</span>
              {state.sources!.map((s, i) => (
                <Badge key={i} variant="outline">
                  {s.type === "policy" ? s.ref : s.type.replace(/_/g, " ")}
                </Badge>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

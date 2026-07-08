"use client";

import { useActionState } from "react";
import {
  createOrganization,
  type OnboardingFormState,
} from "@/app/onboarding/actions";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function OnboardingForm() {
  const [state, action, pending] = useActionState<OnboardingFormState, FormData>(
    createOrganization,
    {},
  );

  return (
    <form action={action} className="flex flex-col gap-4">
      {state.error && (
        <Alert variant="destructive">
          <AlertDescription>{state.error}</AlertDescription>
        </Alert>
      )}
      <div className="flex flex-col gap-2">
        <Label htmlFor="companyName">Company name</Label>
        <Input
          id="companyName"
          name="companyName"
          placeholder="e.g. Driftmark Ltd"
          required
          minLength={2}
        />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="jurisdiction">Jurisdiction</Label>
        <select
          id="jurisdiction"
          name="jurisdiction"
          defaultValue="tz_mainland"
          className="border-input h-9 rounded-md border bg-transparent px-3 text-sm shadow-xs outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <option value="tz_mainland">Tanzania Mainland</option>
          <option value="tz_zanzibar">Zanzibar</option>
        </select>
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="sector">Sector</Label>
        <select
          id="sector"
          name="sector"
          defaultValue="private"
          className="border-input h-9 rounded-md border bg-transparent px-3 text-sm shadow-xs outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <option value="private">Private</option>
          <option value="public">Public</option>
        </select>
      </div>
      <Button type="submit" disabled={pending}>
        {pending ? "Creating workspace…" : "Create workspace"}
      </Button>
    </form>
  );
}

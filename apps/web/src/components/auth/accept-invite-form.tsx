"use client";

import { useActionState } from "react";
import { acceptInviteAction, type AcceptFormState } from "@/app/invite/[token]/actions";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function AcceptInviteForm({
  token,
  knownEmail,
}: {
  token: string;
  knownEmail: string;
}) {
  const [state, action, pending] = useActionState<AcceptFormState, FormData>(
    acceptInviteAction,
    {},
  );

  return (
    <form action={action} className="flex flex-col gap-4">
      {state.error && (
        <Alert variant="destructive">
          <AlertDescription>{state.error}</AlertDescription>
        </Alert>
      )}
      <input name="token" type="hidden" value={token} />
      <div className="flex flex-col gap-2">
        <Label htmlFor="email">Email for signing in / Barua pepe</Label>
        <Input
          defaultValue={knownEmail}
          id="email"
          name="email"
          placeholder="you@example.com"
          required
          type="email"
        />
        {knownEmail && (
          <p className="text-xs text-muted-foreground">
            Pre-filled from your HR record — change it if you prefer another.
          </p>
        )}
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="password">Choose a password / Weka nenosiri</Label>
        <Input
          autoComplete="new-password"
          id="password"
          minLength={8}
          name="password"
          required
          type="password"
        />
      </div>
      <Button disabled={pending} type="submit">
        {pending ? "Setting up… / Inaandaa…" : "Activate my account / Washa akaunti"}
      </Button>
    </form>
  );
}

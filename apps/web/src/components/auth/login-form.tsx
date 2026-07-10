"use client";

import Link from "next/link";
import { useActionState } from "react";
import { SparklesIcon } from "lucide-react";
import { signIn, signInDemo, type AuthFormState } from "@/app/(auth)/actions";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function LoginForm({
  next,
  initialError,
}: {
  next?: string;
  initialError?: string;
}) {
  const [state, action, pending] = useActionState<AuthFormState, FormData>(
    signIn,
    { error: initialError },
  );
  const [demoState, demoAction, demoPending] = useActionState<
    AuthFormState,
    FormData
  >(signInDemo, {});

  return (
    <div className="flex flex-col gap-4">
      <form action={action} className="flex flex-col gap-4">
        {state.error && (
          <Alert variant="destructive">
            <AlertDescription>{state.error}</AlertDescription>
          </Alert>
        )}
        <input type="hidden" name="next" value={next ?? ""} />
        <div className="flex flex-col gap-2">
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            placeholder="you@company.co.tz"
            required
          />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="password">Password</Label>
          <Input
            id="password"
            name="password"
            type="password"
            autoComplete="current-password"
            required
          />
        </div>
        <Button type="submit" disabled={pending || demoPending}>
          {pending ? "Signing in…" : "Sign in"}
        </Button>
      </form>

      <div className="flex items-center gap-3">
        <div className="h-px flex-1 bg-border" />
        <span className="text-xs text-muted-foreground">or</span>
        <div className="h-px flex-1 bg-border" />
      </div>

      <form action={demoAction} className="flex flex-col gap-2">
        {demoState.error && (
          <Alert variant="destructive">
            <AlertDescription>{demoState.error}</AlertDescription>
          </Alert>
        )}
        <Button
          type="submit"
          variant="outline"
          disabled={pending || demoPending}
        >
          <SparklesIcon />
          {demoPending
            ? "Opening the demo…"
            : "Try the demo — Driftmark Technologies"}
        </Button>
        <p className="text-center text-xs text-muted-foreground">
          Explore a fully seeded company: employees, payroll, leave and more.
        </p>
      </form>

      <p className="text-center text-sm text-muted-foreground">
        No account yet?{" "}
        <Link className="text-foreground underline" href="/signup">
          Create one
        </Link>
      </p>
    </div>
  );
}

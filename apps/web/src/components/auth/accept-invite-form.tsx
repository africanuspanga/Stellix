"use client";

import { useActionState, useState } from "react";
import { acceptInviteAction, type AcceptFormState } from "@/app/invite/[token]/actions";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const selectClass =
  "h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/50";

function Field({
  label,
  name,
  type = "text",
  placeholder,
  autoComplete,
}: {
  label: string;
  name: string;
  type?: string;
  placeholder?: string;
  autoComplete?: string;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={name}>{label}</Label>
      <Input autoComplete={autoComplete} id={name} name={name} placeholder={placeholder} type={type} />
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <fieldset className="flex flex-col gap-3 rounded-lg border p-4">
      <legend className="px-1 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
        {title}
      </legend>
      {children}
    </fieldset>
  );
}

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
  const [payMethod, setPayMethod] = useState<"bank" | "mobile_money">("bank");

  return (
    <form action={action} className="flex flex-col gap-5">
      {state.error && (
        <Alert variant="destructive">
          <AlertDescription>{state.error}</AlertDescription>
        </Alert>
      )}
      <input name="token" type="hidden" value={token} />

      <Section title="Account">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="email">Email for signing in / Barua pepe</Label>
          <Input
            defaultValue={knownEmail}
            id="email"
            name="email"
            placeholder="you@example.com"
            required
            type="email"
          />
        </div>
        <div className="flex flex-col gap-1.5">
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
      </Section>

      <p className="text-sm text-muted-foreground">
        The rest is about you — fill what you can now, your HR office sees it
        instantly. You can update it later in My space. / Jaza unachoweza sasa.
      </p>

      <Section title="Your details / Taarifa zako">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Date of birth" name="date_of_birth" type="date" />
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="gender">Gender / Jinsia</Label>
            <select className={selectClass} id="gender" name="gender">
              <option value="">—</option>
              <option value="male">Male / Mume</option>
              <option value="female">Female / Mke</option>
            </select>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="marital_status">Marital status</Label>
            <select className={selectClass} id="marital_status" name="marital_status">
              <option value="">—</option>
              <option value="single">Single</option>
              <option value="married">Married</option>
              <option value="divorced">Divorced</option>
              <option value="widowed">Widowed</option>
            </select>
          </div>
          <Field label="Phone / Simu" name="phone" type="tel" autoComplete="tel" placeholder="07XX XXX XXX" />
        </div>
        <Field label="Personal email" name="personal_email" type="email" placeholder="you@gmail.com" />
        <Field label="Home address / Anuani" name="physical_address" placeholder="Street, ward, city" />
      </Section>

      <Section title="Statutory IDs / Namba za kisheria">
        <Field label="National ID (NIDA)" name="national_id" placeholder="NIDA number" />
        <div className="grid grid-cols-2 gap-3">
          <Field label="TIN" name="tin" />
          <Field label="NSSF number" name="nssf_number" />
        </div>
      </Section>

      <Section title="Emergency contact / Mtu wa dharura">
        <Field label="Full name / Jina" name="emergency_name" />
        <div className="grid grid-cols-2 gap-3">
          <Field label="Relationship / Uhusiano" name="emergency_relationship" placeholder="e.g. spouse, parent" />
          <Field label="Phone / Simu" name="emergency_phone" type="tel" />
        </div>
      </Section>

      <Section title="How you're paid / Malipo yako">
        <div className="flex gap-4 text-sm">
          <label className="flex items-center gap-2">
            <input
              checked={payMethod === "bank"}
              name="payment_method"
              onChange={() => setPayMethod("bank")}
              type="radio"
              value="bank"
            />
            Bank
          </label>
          <label className="flex items-center gap-2">
            <input
              checked={payMethod === "mobile_money"}
              name="payment_method"
              onChange={() => setPayMethod("mobile_money")}
              type="radio"
              value="mobile_money"
            />
            Mobile money / M-Pesa, Tigo, Airtel
          </label>
        </div>
        {payMethod === "bank" ? (
          <>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Bank name" name="bank_name" placeholder="e.g. CRDB, NMB" />
              <Field label="Branch" name="bank_branch" />
            </div>
            <Field label="Account name" name="account_name" />
            <Field label="Account number" name="account_number" />
          </>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            <Field label="Provider" name="mobile_money_provider" placeholder="M-Pesa / Tigo / Airtel" />
            <Field label="Mobile money number" name="mobile_money_number" type="tel" />
          </div>
        )}
      </Section>

      <Button disabled={pending} type="submit">
        {pending ? "Setting up… / Inaandaa…" : "Activate & submit / Washa na wasilisha"}
      </Button>
    </form>
  );
}

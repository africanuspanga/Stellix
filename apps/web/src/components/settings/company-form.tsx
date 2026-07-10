"use client";

import { useActionState } from "react";
import {
  saveCompany,
  type CompanyFormState,
} from "@/app/dashboard/settings/company/actions";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const selectClass =
  "h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/50";

// Common East/Central African zones; all are UTC+2/+3 without DST.
const TIMEZONES = [
  "Africa/Dar_es_Salaam",
  "Africa/Nairobi",
  "Africa/Kampala",
  "Africa/Kigali",
  "Africa/Lusaka",
  "Africa/Maputo",
];

export function CompanyForm({
  initial,
}: {
  initial: {
    name: string;
    defaultLocale: string;
    timezone: string;
    hrWhatsapp: string;
  };
}) {
  const [state, action, pending] = useActionState<CompanyFormState, FormData>(
    saveCompany,
    {},
  );

  return (
    <form action={action} className="flex max-w-lg flex-col gap-4">
      {state.error && (
        <Alert variant="destructive">
          <AlertDescription>{state.error}</AlertDescription>
        </Alert>
      )}
      {state.success && (
        <Alert>
          <AlertDescription>Company profile saved.</AlertDescription>
        </Alert>
      )}
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="name">Company name</Label>
        <Input defaultValue={initial.name} id="name" name="name" required />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="default_locale">Default language</Label>
          <select
            className={selectClass}
            defaultValue={initial.defaultLocale}
            id="default_locale"
            name="default_locale"
          >
            <option value="en">English</option>
            <option value="sw">Swahili / Kiswahili</option>
          </select>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="timezone">Timezone</Label>
          <select className={selectClass} defaultValue={initial.timezone} id="timezone" name="timezone">
            {TIMEZONES.map((tz) => (
              <option key={tz} value={tz}>
                {tz.replace("Africa/", "").replace(/_/g, " ")}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="hr_whatsapp_number">HR WhatsApp number</Label>
        <Input
          defaultValue={initial.hrWhatsapp}
          id="hr_whatsapp_number"
          name="hr_whatsapp_number"
          placeholder="+255 7XX XXX XXX"
          type="tel"
        />
        <p className="text-xs text-muted-foreground">
          Powers the &ldquo;HR kwenye WhatsApp&rdquo; button on the employee Huduma screen.
        </p>
      </div>
      <Button className="w-fit" disabled={pending} type="submit">
        {pending ? "Saving…" : "Save company profile"}
      </Button>
    </form>
  );
}

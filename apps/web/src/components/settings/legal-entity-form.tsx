"use client";

import { useActionState } from "react";
import {
  saveLegalEntity,
  type CompanyFormState,
} from "@/app/dashboard/settings/company/actions";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const selectClass =
  "h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/50";

export interface LegalEntityValues {
  id: string;
  name: string;
  registrationNumber: string;
  tin: string;
  jurisdiction: string;
  sector: string;
  address: string;
}

export function LegalEntityForm({ entity }: { entity: LegalEntityValues }) {
  const [state, action, pending] = useActionState<CompanyFormState, FormData>(
    saveLegalEntity,
    {},
  );

  return (
    <form action={action} className="flex flex-col gap-4 rounded-lg border p-4">
      <input name="legal_entity_id" type="hidden" value={entity.id} />
      {state.error && (
        <Alert variant="destructive">
          <AlertDescription>{state.error}</AlertDescription>
        </Alert>
      )}
      {state.success && (
        <Alert>
          <AlertDescription>Legal entity saved.</AlertDescription>
        </Alert>
      )}
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={`name-${entity.id}`}>Legal entity name</Label>
        <Input defaultValue={entity.name} id={`name-${entity.id}`} name="name" required />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`reg-${entity.id}`}>Registration number (BRELA)</Label>
          <Input defaultValue={entity.registrationNumber} id={`reg-${entity.id}`} name="registration_number" />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`tin-${entity.id}`}>TIN</Label>
          <Input defaultValue={entity.tin} id={`tin-${entity.id}`} name="tin" />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`jur-${entity.id}`}>Jurisdiction</Label>
          <select className={selectClass} defaultValue={entity.jurisdiction} id={`jur-${entity.id}`} name="jurisdiction">
            <option value="tz_mainland">Tanzania Mainland</option>
            <option value="tz_zanzibar">Zanzibar</option>
          </select>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`sec-${entity.id}`}>Sector</Label>
          <select className={selectClass} defaultValue={entity.sector} id={`sec-${entity.id}`} name="sector">
            <option value="private">Private</option>
            <option value="public">Public</option>
          </select>
        </div>
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={`addr-${entity.id}`}>Registered address</Label>
        <Input defaultValue={entity.address} id={`addr-${entity.id}`} name="address" placeholder="Street, ward, city, region" />
      </div>
      <p className="text-xs text-muted-foreground">
        Jurisdiction and sector select which compliance pack (PAYE/NSSF/SDL/WCF
        rates) applies. Change with care — it affects payroll calculation.
      </p>
      <Button className="w-fit" disabled={pending} type="submit" variant="outline">
        {pending ? "Saving…" : "Save legal entity"}
      </Button>
    </form>
  );
}

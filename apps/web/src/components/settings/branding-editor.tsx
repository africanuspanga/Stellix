"use client";

import { useActionState, useState } from "react";
import { CheckIcon } from "lucide-react";
import {
  saveBranding,
  removeLogo,
  type BrandingFormState,
} from "@/app/dashboard/settings/branding/actions";
import {
  TEMPLATES,
  type PayslipBranding,
  type PayslipTemplate,
} from "@/lib/payslip/branding";
import {
  PayslipDocument,
  type PayslipData,
} from "@/components/payslip/payslip-document";
import { LogoUpload } from "@/components/settings/logo-upload";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

const SAMPLE: PayslipData = {
  companyName: "Your Company Ltd",
  period: "2026-07",
  employeeName: "Asha Mwamba",
  employeeNumber: "EMP-0001",
  basicSalary: 1_000_000,
  earnings: [{ code: "HRA", name: "Housing allowance", amount: 150_000 }],
  grossPay: 1_150_000,
  deductions: [
    { code: "PAYE", name: "PAYE", amount: 128_000 },
    { code: "NSSF", name: "NSSF (employee)", amount: 100_000 },
  ],
  totalDeductions: 228_000,
  netPay: 922_000,
  taxableIncome: 1_050_000,
  paye: 128_000,
  employerContributions: [{ code: "SDL", name: "SDL", amount: 40_250 }],
  status: "approved",
  runId: "sample000",
};

export function BrandingEditor({
  initial,
}: {
  initial: PayslipBranding;
}) {
  const [state, formAction, pending] = useActionState<BrandingFormState, FormData>(
    saveBranding,
    {},
  );
  const [template, setTemplate] = useState<PayslipTemplate>(initial.template);
  const [brandColor, setBrandColor] = useState(initial.brandColor);
  const [accentColor, setAccentColor] = useState(initial.accentColor);
  const [footerNote, setFooterNote] = useState(initial.footerNote ?? "");

  const preview: PayslipBranding = {
    template,
    brandColor,
    accentColor,
    logoUrl: initial.logoUrl,
    footerNote: footerNote || null,
  };

  return (
    <div className="grid gap-8 lg:grid-cols-[1fr_minmax(0,24rem)]">
      <div className="flex flex-col gap-6">
        <LogoUpload logoUrl={initial.logoUrl} onRemove={removeLogo} />

        <form action={formAction} className="flex flex-col gap-6">
          {state.error && (
            <Alert variant="destructive">
              <AlertDescription>{state.error}</AlertDescription>
            </Alert>
          )}
          {state.success && (
            <Alert>
              <AlertDescription>Payslip branding saved.</AlertDescription>
            </Alert>
          )}

          <div className="flex flex-col gap-2">
            <Label>Template</Label>
            <input name="template" type="hidden" value={template} />
            <div className="grid grid-cols-2 gap-3">
              {TEMPLATES.map((t) => (
                <button
                  className={cn(
                    "relative flex flex-col gap-1 rounded-lg border p-3 text-left transition-colors",
                    template === t.key
                      ? "border-foreground ring-1 ring-foreground"
                      : "hover:bg-muted/50",
                  )}
                  key={t.key}
                  onClick={() => setTemplate(t.key)}
                  type="button"
                >
                  {template === t.key && (
                    <CheckIcon className="absolute right-2 top-2 size-4" />
                  )}
                  <span className="font-medium">{t.name}</span>
                  <span className="text-xs text-muted-foreground">{t.description}</span>
                  <span className="mt-1 flex gap-1">
                    <span className="size-4 rounded" style={{ backgroundColor: brandColor }} />
                    <span className="size-4 rounded" style={{ backgroundColor: accentColor }} />
                  </span>
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <ColorField
              label="Brand colour"
              name="brand_color"
              value={brandColor}
              onChange={setBrandColor}
            />
            <ColorField
              label="Accent colour"
              name="accent_color"
              value={accentColor}
              onChange={setAccentColor}
            />
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="footer_note">Footer note (optional)</Label>
            <Input
              id="footer_note"
              maxLength={300}
              name="footer_note"
              onChange={(e) => setFooterNote(e.target.value)}
              placeholder="e.g. Queries? Contact hr@yourcompany.co.tz"
              value={footerNote}
            />
          </div>

          <Button className="w-fit" disabled={pending} type="submit">
            {pending ? "Saving…" : "Save branding"}
          </Button>
        </form>
      </div>

      <div className="flex flex-col gap-2">
        <span className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
          Live preview
        </span>
        <div className="sticky top-20 text-xs">
          <PayslipDocument branding={preview} data={SAMPLE} />
        </div>
      </div>
    </div>
  );
}

function ColorField({
  label,
  name,
  value,
  onChange,
}: {
  label: string;
  name: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor={name}>{label}</Label>
      <div className="flex items-center gap-2">
        <input
          aria-label={label}
          className="size-9 shrink-0 cursor-pointer rounded-md border bg-transparent"
          onChange={(e) => onChange(e.target.value.toUpperCase())}
          type="color"
          value={value}
        />
        <Input
          id={name}
          name={name}
          onChange={(e) => onChange(e.target.value.toUpperCase())}
          pattern="#[0-9A-Fa-f]{6}"
          value={value}
        />
      </div>
    </div>
  );
}

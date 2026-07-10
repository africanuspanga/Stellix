"use client";

import { useActionState } from "react";
import { UploadIcon, Trash2Icon } from "lucide-react";
import {
  uploadLogo,
  type BrandingFormState,
} from "@/app/dashboard/settings/branding/actions";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";

export function LogoUpload({
  logoUrl,
  onRemove,
}: {
  logoUrl: string | null;
  onRemove: () => Promise<void>;
}) {
  const [state, formAction, pending] = useActionState<BrandingFormState, FormData>(
    uploadLogo,
    {},
  );

  return (
    <div className="flex flex-col gap-2">
      <Label>Company logo</Label>
      {state.error && (
        <Alert variant="destructive">
          <AlertDescription>{state.error}</AlertDescription>
        </Alert>
      )}
      <div className="flex items-center gap-4 rounded-lg border p-4">
        <div className="flex size-16 shrink-0 items-center justify-center overflow-hidden rounded-md border bg-muted/40">
          {logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img alt="Current logo" className="size-full object-contain p-1" src={logoUrl} />
          ) : (
            <span className="text-xs text-muted-foreground">None</span>
          )}
        </div>
        <div className="flex flex-col gap-2">
          <form action={formAction} className="flex items-center gap-2">
            <input
              accept="image/png,image/jpeg,image/svg+xml,image/webp"
              className="text-xs file:mr-2 file:rounded-md file:border file:bg-background file:px-2 file:py-1 file:text-xs"
              name="logo"
              required
              type="file"
            />
            <Button disabled={pending} size="sm" type="submit" variant="outline">
              <UploadIcon />
              {pending ? "Uploading…" : "Upload"}
            </Button>
          </form>
          {logoUrl && (
            <form action={onRemove}>
              <Button
                className="text-muted-foreground"
                size="sm"
                type="submit"
                variant="ghost"
              >
                <Trash2Icon />
                Remove logo
              </Button>
            </form>
          )}
          <p className="text-xs text-muted-foreground">PNG, JPG or SVG · up to 2 MB.</p>
        </div>
      </div>
    </div>
  );
}

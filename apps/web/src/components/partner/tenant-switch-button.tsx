"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { setActiveTenant } from "@/app/(auth)/actions";
import { Button } from "@/components/ui/button";

export function TenantSwitchButton({
  tenantId,
  isActive,
}: {
  tenantId: string;
  isActive: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  if (isActive) return null;
  return (
    <Button
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          await setActiveTenant(tenantId);
          router.refresh();
        })
      }
      size="sm"
      variant="outline"
    >
      {pending ? "Switching…" : "Switch to client"}
    </Button>
  );
}

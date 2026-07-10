"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { Building2Icon, CheckIcon, ChevronsUpDownIcon } from "lucide-react";
import { setActiveTenant } from "@/app/(auth)/actions";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export interface TenantOption {
  id: string;
  name: string;
}

export function TenantSwitcher({
  tenants,
  activeTenantId,
}: {
  tenants: TenantOption[];
  activeTenantId: string | null;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const active = tenants.find((t) => t.id === activeTenantId) ?? tenants[0];

  if (!active) return null;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            className="max-w-48 justify-start gap-2"
            disabled={pending}
            size="sm"
            variant="outline"
          />
        }
      >
        <Building2Icon className="size-4 shrink-0" />
        <span className="truncate">{active.name}</span>
        <ChevronsUpDownIcon className="ml-auto size-3.5 shrink-0 text-muted-foreground" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-56">
        {/* Base UI: GroupLabel must live inside a Group or the menu crashes. */}
        <DropdownMenuGroup>
          <DropdownMenuLabel>Workspaces</DropdownMenuLabel>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        {tenants.map((tenant) => (
          <DropdownMenuItem
            key={tenant.id}
            onClick={() =>
              startTransition(async () => {
                await setActiveTenant(tenant.id);
                router.refresh();
              })
            }
          >
            <span className="truncate">{tenant.name}</span>
            {tenant.id === active.id && <CheckIcon className="ml-auto size-4" />}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

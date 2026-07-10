"use client";

import Link from "next/link";
import { useTransition } from "react";
import { BellIcon } from "lucide-react";
import { markAllNotificationsRead } from "@/app/dashboard/notifications-actions";
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

export interface NotificationItem {
  id: string;
  title: string;
  body: string | null;
  link: string | null;
  createdAt: string;
  unread: boolean;
}

export function NotificationsBell({ items }: { items: NotificationItem[] }) {
  const [pending, startTransition] = useTransition();
  const unreadCount = items.filter((n) => n.unread).length;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button aria-label="Notifications" className="relative" size="icon-sm" variant="outline" />
        }
      >
        <BellIcon />
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 flex size-4 items-center justify-center rounded-full bg-foreground font-mono text-[10px] text-background">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80">
        {/* Base UI: GroupLabel must live inside a Group or the menu crashes. */}
        <DropdownMenuGroup>
          <DropdownMenuLabel className="flex items-center justify-between">
            Notifications
            {unreadCount > 0 && (
              <button
                className="text-xs font-normal text-muted-foreground underline underline-offset-2 hover:text-foreground"
                disabled={pending}
                onClick={() => startTransition(() => markAllNotificationsRead())}
                type="button"
              >
                mark all read
              </button>
            )}
          </DropdownMenuLabel>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        {items.length === 0 && (
          <p className="px-3 py-4 text-center text-sm text-muted-foreground">
            Nothing yet.
          </p>
        )}
        {items.map((item) => (
          <DropdownMenuItem key={item.id} render={item.link ? <Link href={item.link} /> : undefined}>
            <div className="flex flex-col gap-0.5 py-1">
              <p className={`text-sm leading-tight ${item.unread ? "font-medium" : "text-muted-foreground"}`}>
                {item.title}
              </p>
              {item.body && (
                <p className="line-clamp-2 text-xs text-muted-foreground">{item.body}</p>
              )}
              <p className="font-mono text-[10px] text-muted-foreground">
                {item.createdAt.slice(0, 16).replace("T", " ")}
              </p>
            </div>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

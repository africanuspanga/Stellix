"use client";

import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { AppBreadcrumbs } from "@/components/app-breadcrumbs";
import { CustomSidebarTrigger } from "@/components/custom-sidebar-trigger";
import { navLinks } from "@/components/app-shared";
import { NavUser, type NavUserInfo } from "@/components/nav-user";
import { TenantSwitcher, type TenantOption } from "@/components/tenant-switcher";
import { NotificationsBell, type NotificationItem } from "@/components/notifications-bell";
import { SendIcon } from "lucide-react";

export function AppHeader({
  user,
  tenants,
  activeTenantId,
  notifications = [],
}: {
  user: NavUserInfo;
  tenants: TenantOption[];
  activeTenantId: string | null;
  notifications?: NotificationItem[];
}) {
	const pathname = usePathname();
	// Longest matching route wins, so /dashboard/organization/branches
	// resolves to "Branches" rather than "Overview".
	const activeItem = navLinks
		.filter((item) => item.path && !item.path.startsWith("#"))
		.sort((a, b) => (b.path?.length ?? 0) - (a.path?.length ?? 0))
		.find((item) => pathname === item.path || pathname.startsWith(`${item.path}/`))
		?? navLinks.find((item) => item.isActive);

	return (
		<header
			className={cn(
				"sticky top-0 z-50 flex h-14 shrink-0 items-center justify-between gap-2 border-b px-4 md:px-6"
			)}
		>
			<div className="flex items-center gap-3">
				<CustomSidebarTrigger />
				<Separator
					className="mr-2 h-4 data-[orientation=vertical]:self-center"
					orientation="vertical"
				/>
				<AppBreadcrumbs page={activeItem} />
			</div>
			<div className="flex items-center gap-3">
				<TenantSwitcher activeTenantId={activeTenantId} tenants={tenants} />
				<Button size="icon-sm" variant="outline">
					<SendIcon
					/>
				</Button>
				<NotificationsBell items={notifications} />
				<Separator
					className="h-4 data-[orientation=vertical]:self-center"
					orientation="vertical"
				/>
				<NavUser user={user} />
			</div>
		</header>
	);
}

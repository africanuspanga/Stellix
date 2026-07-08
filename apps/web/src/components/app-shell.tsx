import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { AppHeader } from "@/components/app-header";
import { AppSidebar } from "@/components/app-sidebar";
import type { NavUserInfo } from "@/components/nav-user";
import type { TenantOption } from "@/components/tenant-switcher";
import type { NotificationItem } from "@/components/notifications-bell";

export function AppShell({
	children,
	user,
	tenants,
	activeTenantId,
	notifications = [],
}: {
	children: React.ReactNode;
	user: NavUserInfo;
	tenants: TenantOption[];
	activeTenantId: string | null;
	notifications?: NotificationItem[];
}) {
	return (
		<div className="overflow-hidden">
			<SidebarProvider className="relative h-svh">
				<AppSidebar />
				<SidebarInset className="md:peer-data-[variant=inset]:ml-0">
					<AppHeader
						activeTenantId={activeTenantId}
						notifications={notifications}
						tenants={tenants}
						user={user}
					/>
					<div className="flex flex-1 flex-col gap-4 overflow-y-auto p-4 md:p-6">
						{children}
					</div>
				</SidebarInset>
			</SidebarProvider>
		</div>
	);
}

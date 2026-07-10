import {
	NavigationMenu,
	NavigationMenuContent,
	NavigationMenuItem,
	NavigationMenuLink,
	NavigationMenuList,
	NavigationMenuTrigger,
} from "@/components/ui/navigation-menu";
import { companyLinks, companyLinks2, productLinks } from "@/components/nav-links";
import { LinkItem } from "@/components/sheard";

export function DesktopNav() {
	return (
		<NavigationMenu className="hidden md:flex">
			<NavigationMenuList>
				<NavigationMenuItem>
					<NavigationMenuTrigger className="bg-transparent">
						Product
					</NavigationMenuTrigger>
					<NavigationMenuContent className="p-1 pr-1.5">
						<div className="rounded-lg grid w-lg grid-cols-2 gap-2 border bg-card p-2 shadow">
							{productLinks.map((item, i) => (
								<NavigationMenuLink
									key={`item-${item.label}-${i}`}
									render={<LinkItem {...item} />}
								/>
							))}
						</div>
						<div className="p-2">
							<p className="text-muted-foreground text-sm">
								Curious?{" "}
								<a
									className="font-medium text-foreground hover:underline"
									href="/login"
								>
									Try the live demo
								</a>
							</p>
						</div>
					</NavigationMenuContent>
				</NavigationMenuItem>
				<NavigationMenuItem>
					<NavigationMenuTrigger className="bg-transparent">
						Company
					</NavigationMenuTrigger>
					<NavigationMenuContent className="p-1 pr-1.5 pb-1.5">
						<div className="grid w-lg grid-cols-2 gap-2">
							<div className="rounded-lg space-y-2 border bg-card p-2 shadow">
								{companyLinks.map((item, i) => (
									<NavigationMenuLink
										className="rounded-sm"
										key={`item-${item.label}-${i}`}
										render={<LinkItem {...item} />}
									/>
								))}
							</div>
							<div className="space-y-2 p-3">
								{companyLinks2.map((item, i) => (
									<NavigationMenuLink
										href={item.href}
										key={`item-${item.label}-${i}`}
									>
										{item.icon}
										{item.label}
									</NavigationMenuLink>
								))}
							</div>
						</div>
					</NavigationMenuContent>
				</NavigationMenuItem>
				<NavigationMenuLink className="px-4" href="/login">
					Demo
				</NavigationMenuLink>
			</NavigationMenuList>
		</NavigationMenu>
	);
}

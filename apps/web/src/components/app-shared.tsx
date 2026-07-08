import type { ReactNode } from "react";
import {
	LayoutGridIcon,
	UsersIcon,
	ClockIcon,
	BanknoteIcon,
	ShieldCheckIcon,
	MessageSquareTextIcon,
	SparklesIcon,
	SettingsIcon,
	HelpCircleIcon,
	ActivityIcon,
} from "lucide-react";

export type SidebarNavItem = {
	title: string;
	path?: string;
	icon?: ReactNode;
	isActive?: boolean;
	subItems?: SidebarNavItem[];
};

export type SidebarNavGroup = {
	label?: string;
	items: SidebarNavItem[];
};

// Navigation follows the six product pillars (docs/BLUEPRINT.md).
// Routes marked "#/..." are placeholders until their sprint lands.
export const navGroups: SidebarNavGroup[] = [
	{
		items: [
			{
				title: "Overview",
				path: "/dashboard",
				icon: <LayoutGridIcon />,
				isActive: true,
			},
		],
	},
	{
		label: "People",
		items: [
			{
				title: "People",
				icon: <UsersIcon />,
				subItems: [
					{ title: "Employees", path: "#/people/employees" },
					{ title: "Positions", path: "#/people/positions" },
					{ title: "Onboarding", path: "#/people/onboarding" },
					{ title: "Recruitment", path: "#/people/recruitment" },
				],
			},
		],
	},
	{
		label: "Time",
		items: [
			{
				title: "Time",
				icon: <ClockIcon />,
				subItems: [
					{ title: "Attendance", path: "#/time/attendance" },
					{ title: "Leave", path: "#/time/leave" },
					{ title: "Shifts & roster", path: "#/time/roster" },
					{ title: "Timesheets", path: "#/time/timesheets" },
				],
			},
		],
	},
	{
		label: "Payroll",
		items: [
			{
				title: "Payroll",
				icon: <BanknoteIcon />,
				subItems: [
					{ title: "Payroll runs", path: "#/payroll/runs" },
					{ title: "Payslips", path: "#/payroll/payslips" },
					{ title: "Loans & advances", path: "#/payroll/loans" },
					{ title: "Payments", path: "#/payroll/payments" },
				],
			},
		],
	},
	{
		label: "Compliance",
		items: [
			{
				title: "Compliance",
				icon: <ShieldCheckIcon />,
				subItems: [
					{ title: "Dashboard", path: "#/compliance/dashboard" },
					{ title: "Statutory filings", path: "#/compliance/filings" },
					{ title: "Rules & packs", path: "#/compliance/rules" },
				],
			},
		],
	},
	{
		label: "Experience & AI",
		items: [
			{
				title: "Service desk",
				path: "#/experience/service-desk",
				icon: <MessageSquareTextIcon />,
			},
			{
				title: "AI assistant",
				path: "#/ai/assistant",
				icon: <SparklesIcon />,
			},
		],
	},
	{
		label: "Organization",
		items: [
			{
				title: "Settings",
				icon: <SettingsIcon />,
				subItems: [
					{ title: "Company", path: "#/settings/company" },
					{ title: "Team & roles", path: "#/settings/team" },
					{ title: "Workflows", path: "#/settings/workflows" },
					{ title: "Billing", path: "#/settings/billing" },
				],
			},
		],
	},
];

export const footerNavLinks: SidebarNavItem[] = [
	{
		title: "Help Center",
		path: "#/help",
		icon: <HelpCircleIcon />,
	},
	{
		title: "System status",
		path: "#/status",
		icon: <ActivityIcon />,
	},
];

export const navLinks: SidebarNavItem[] = [
	...navGroups.flatMap((group) =>
		group.items.flatMap((item) =>
			item.subItems?.length ? [item, ...item.subItems] : [item]
		)
	),
	...footerNavLinks,
];

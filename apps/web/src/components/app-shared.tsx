import type { ReactNode } from "react";
import {
	LayoutGridIcon,
	CircleUserIcon,
	UsersRoundIcon,
	HandHelpingIcon,
	BriefcaseIcon,
	UsersIcon,
	Building2Icon,
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
			{
				title: "My space",
				path: "/dashboard/me",
				icon: <CircleUserIcon />,
			},
			{
				title: "My team",
				path: "/dashboard/team",
				icon: <UsersRoundIcon />,
			},
			{
				title: "Huduma",
				path: "/dashboard/huduma",
				icon: <HandHelpingIcon />,
			},
			{
				title: "Clients",
				path: "/dashboard/partner",
				icon: <BriefcaseIcon />,
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
					{ title: "Employees", path: "/dashboard/people/employees" },
					{ title: "Onboarding", path: "/dashboard/people/onboarding" },
					{ title: "Probation", path: "/dashboard/people/probation" },
					{ title: "Import centre", path: "/dashboard/import" },
					{ title: "Recruitment", path: "#/people/recruitment" },
				],
			},
			{
				title: "Organization",
				icon: <Building2Icon />,
				subItems: [
					{ title: "Overview", path: "/dashboard/organization" },
					{ title: "Branches", path: "/dashboard/organization/branches" },
					{ title: "Departments", path: "/dashboard/organization/departments" },
					{ title: "Cost centres", path: "/dashboard/organization/cost-centres" },
					{ title: "Jobs & grades", path: "/dashboard/organization/job-grades" },
					{ title: "Positions", path: "/dashboard/organization/positions" },
					{ title: "Org chart", path: "/dashboard/organization/org-chart" },
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
					{ title: "Leave", path: "/dashboard/time/leave" },
					{ title: "Leave types", path: "/dashboard/time/leave/types" },
					{ title: "Holidays", path: "/dashboard/time/holidays" },
					{ title: "Attendance", path: "/dashboard/time/attendance" },
					{ title: "Shifts & roster", path: "/dashboard/time/roster" },
					{ title: "Timesheets", path: "/dashboard/time/timesheets" },
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
					{ title: "Payroll runs", path: "/dashboard/payroll/runs" },
					{ title: "Calculator", path: "/dashboard/payroll/calculator" },
					{ title: "Sandbox", path: "/dashboard/payroll/sandbox" },
					{ title: "Pay components", path: "/dashboard/payroll/components" },
					{ title: "Loans & advances", path: "#/payroll/loans" },
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
					{ title: "Dashboard", path: "/dashboard/compliance" },
					{ title: "Statutory filings", path: "/dashboard/compliance/filings" },
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
				path: "/dashboard/experience/service-desk",
				icon: <MessageSquareTextIcon />,
			},
			{
				title: "AI assistant",
				path: "/dashboard/ai",
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
					{ title: "Workflows", path: "/dashboard/settings/workflows" },
					{ title: "Policies", path: "/dashboard/settings/policies" },
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

import type { LinkItemType } from "@/components/sheard";
import {
	UsersIcon,
	ClockIcon,
	BanknoteIcon,
	ShieldCheckIcon,
	MessageSquareTextIcon,
	SparklesIcon,
	FileTextIcon,
	MapIcon,
	GitBranchIcon,
	LogInIcon,
	RocketIcon,
	PlayIcon,
} from "lucide-react";

// The six product pillars (docs/BLUEPRINT.md) drive the landing navigation.
export const productLinks: LinkItemType[] = [
	{
		label: "People",
		href: "#pillars",
		description: "Employees, recruitment, onboarding, performance, offboarding",
		icon: <UsersIcon />,
	},
	{
		label: "Time",
		href: "#pillars",
		description: "Attendance, leave, shifts, rostering and timesheets",
		icon: <ClockIcon />,
	},
	{
		label: "Payroll",
		href: "#pillars",
		description: "Deterministic gross-to-net with PAYE, NSSF, SDL and WCF",
		icon: <BanknoteIcon />,
	},
	{
		label: "Compliance",
		href: "#pillars",
		description: "Effective-dated statutory rules for Mainland and Zanzibar",
		icon: <ShieldCheckIcon />,
	},
	{
		label: "Employee Experience",
		href: "#pillars",
		description: "Web, mobile and WhatsApp self-service for every worker",
		icon: <MessageSquareTextIcon />,
	},
	{
		label: "AI Intelligence",
		href: "#pillars",
		description: "AI explains payroll and policy — it never calculates pay",
		icon: <SparklesIcon />,
	},
];

export const companyLinks: LinkItemType[] = [
	{
		label: "Product blueprint",
		href: "https://github.com/africanuspanga/Stellix/blob/main/docs/BLUEPRINT.md",
		description: "The vision and architecture, in the open",
		icon: <FileTextIcon />,
	},
	{
		label: "Roadmap",
		href: "https://github.com/africanuspanga/Stellix/blob/main/docs/SPRINTS.md",
		description: "What has shipped and what is next",
		icon: <MapIcon />,
	},
	{
		label: "GitHub",
		href: "https://github.com/africanuspanga/Stellix",
		description: "Follow the build",
		icon: <GitBranchIcon />,
	},
];

export const companyLinks2: LinkItemType[] = [
	{
		label: "Sign in",
		href: "/login",
		icon: <LogInIcon />,
	},
	{
		label: "Create workspace",
		href: "/signup",
		icon: <RocketIcon />,
	},
	{
		label: "Try the live demo",
		href: "/login",
		icon: <PlayIcon />,
	},
];

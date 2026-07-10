import Link from "next/link";
import {
	UsersIcon,
	GraduationCapIcon,
	PlaneIcon,
	ClipboardCheckIcon,
	CalendarClockIcon,
	FileClockIcon,
	BriefcaseIcon,
	ArrowUpRightIcon,
	ActivityIcon,
} from "lucide-react";
import { getTenancyContext } from "@/lib/tenancy/context";
import {
	getDashboardMetrics,
	getRecentActivity,
} from "@/lib/dashboard/metrics";
import { Button } from "@/components/ui/button";
import {
	Card,
	CardContent,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";

interface Stat {
	label: string;
	value: number;
	hint: string;
	href: string;
	icon: React.ReactNode;
}

function StatCard({ label, value, hint, href, icon }: Stat) {
	return (
		<Link className="group" href={href}>
			<Card className="h-full gap-3 p-4 transition-colors hover:ring-foreground/25">
				<div className="flex items-center justify-between text-muted-foreground">
					<span className="text-sm">{label}</span>
					{icon}
				</div>
				<div className="text-3xl font-semibold tracking-tight tabular-nums">
					{value.toLocaleString()}
				</div>
				<span className="text-xs text-muted-foreground">{hint}</span>
			</Card>
		</Link>
	);
}

export async function Dashboard() {
	const context = await getTenancyContext();
	const activeTenant = context?.activeTenant ?? null;
	if (!activeTenant) return null; // layout redirects before this renders

	const [m, activity] = await Promise.all([
		getDashboardMetrics(activeTenant.id),
		getRecentActivity(activeTenant.id),
	]);

	const stats: Stat[] = [
		{ label: "Active headcount", value: m.headcount, hint: "Employees currently employed", href: "/dashboard/people/employees", icon: <UsersIcon className="size-4" /> },
		{ label: "On probation", value: m.probation, hint: "Awaiting confirmation", href: "/dashboard/people/probation", icon: <GraduationCapIcon className="size-4" /> },
		{ label: "On leave", value: m.onLeave, hint: "Currently away", href: "/dashboard/time/leave", icon: <PlaneIcon className="size-4" /> },
		{ label: "Pending actions", value: m.pendingActions, hint: "Employment actions to approve", href: "/dashboard/people/employees", icon: <ClipboardCheckIcon className="size-4" /> },
		{ label: "Pending leave", value: m.pendingLeave, hint: "Requests awaiting approval", href: "/dashboard/time/leave", icon: <CalendarClockIcon className="size-4" /> },
		{ label: "Contracts expiring", value: m.contractsExpiring, hint: "Within the next 60 days", href: "/dashboard/people/employees", icon: <FileClockIcon className="size-4" /> },
		{ label: "Open positions", value: m.openPositions, hint: "Vacant or budgeted", href: "/dashboard/organization/positions", icon: <BriefcaseIcon className="size-4" /> },
	];

	return (
		<div className="flex flex-col gap-6">
			<div className="flex flex-wrap items-end justify-between gap-3">
				<div className="flex flex-col gap-1">
					<h1 className="text-2xl font-semibold tracking-tight">
						{activeTenant.name}
					</h1>
					<p className="text-sm text-muted-foreground">
						Workforce overview — hiring to payroll, in one place.
					</p>
				</div>
				<div className="flex gap-2">
					<Button
						nativeButton={false}
						render={<Link href="/dashboard/people/employees" />}
						size="sm"
						variant="outline"
					>
						Employees
					</Button>
					<Button
						nativeButton={false}
						render={<Link href="/dashboard/payroll/runs" />}
						size="sm"
					>
						Payroll runs
					</Button>
				</div>
			</div>

			{m.headcount === 0 ? (
				<Card className="items-start gap-3 p-6">
					<h2 className="text-lg font-semibold">Add your first employees</h2>
					<p className="max-w-prose text-sm text-muted-foreground">
						Your workspace is ready. Import your team from Excel or add
						employees one by one to unlock payroll, leave, attendance and
						compliance.
					</p>
					<div className="flex gap-2">
						<Button nativeButton={false} render={<Link href="/dashboard/people/employees" />}>
							Add employee
						</Button>
						<Button nativeButton={false} render={<Link href="/dashboard/import" />} variant="outline">
							Import from Excel
						</Button>
					</div>
				</Card>
			) : (
				<section className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
					{stats.map((stat) => (
						<StatCard key={stat.label} {...stat} />
					))}

					<Card className="gap-0 sm:col-span-2 lg:col-span-1 lg:row-span-2">
						<CardHeader>
							<CardTitle className="flex items-center gap-2">
								<ActivityIcon className="size-4 text-muted-foreground" />
								Recent activity
							</CardTitle>
						</CardHeader>
						<CardContent>
							{activity.length === 0 ? (
								<p className="py-2 text-sm text-muted-foreground">
									Nothing recorded yet.
								</p>
							) : (
								<ul className="flex flex-col gap-2.5">
									{activity.map((entry, i) => (
										<li className="flex flex-col" key={`${entry.createdAt}-${i}`}>
											<span className="text-sm">
												{entry.action.replace(/[._]/g, " ")}
											</span>
											<span className="font-mono text-[10px] text-muted-foreground">
												{entry.entityType} ·{" "}
												{entry.createdAt.slice(0, 16).replace("T", " ")}
											</span>
										</li>
									))}
								</ul>
							)}
						</CardContent>
					</Card>

					<Link className="group sm:col-span-2 lg:col-span-3" href="/dashboard/compliance">
						<Card className="h-full flex-row items-center justify-between p-4 transition-colors hover:ring-foreground/25">
							<div className="flex flex-col gap-0.5">
								<span className="font-medium">Compliance dashboard</span>
								<span className="text-sm text-muted-foreground">
									Statutory filings, minimum wage, contracts and working-hours
									checks for Tanzania Mainland &amp; Zanzibar.
								</span>
							</div>
							<ArrowUpRightIcon className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
						</Card>
					</Link>
				</section>
			)}
		</div>
	);
}

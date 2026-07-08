import Link from "next/link";
import { PILLARS } from "@hr/config";
import { LogoIcon } from "@/components/logo";
import { Button } from "@/components/ui/button";

const PILLAR_DESCRIPTIONS: Record<string, string> = {
  people: "Employees, recruitment, onboarding, performance and offboarding",
  time: "Attendance, leave, shifts, rostering and timesheets",
  payroll: "Compensation, calculations, payments, loans and accounting",
  compliance: "Statutory rules, labour compliance, filings, privacy and safety",
  experience: "Web, mobile, WhatsApp, self-service and HR support",
  ai: "Explanations, insights, automation and decision support",
};

export default function Home() {
  const supabaseConfigured = Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL);
  const aiConfigured = Boolean(process.env.MOONSHOT_API_KEY);

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-12 px-6 py-16">
      <header className="flex flex-col gap-4">
        <div className="flex items-center gap-2">
          <LogoIcon className="size-6" />
          <span className="text-lg font-bold tracking-tight">Stellix</span>
        </div>
        <p className="text-sm font-medium uppercase tracking-widest text-muted-foreground">
          Powering Africa&apos;s Workforce
        </p>
        <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">
          The AI-native workforce &amp; payroll operating system
        </h1>
        <p className="max-w-2xl text-lg text-muted-foreground">
          Manage employees from hiring to exit, automate compliant payroll,
          control attendance and shifts, and give every worker access through
          web, mobile and WhatsApp.
        </p>
        <div>
          <Button render={<Link href="/dashboard" />} nativeButton={false}>
            Open dashboard
          </Button>
        </div>
      </header>

      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {PILLARS.map((pillar) => (
          <div key={pillar.key} className="rounded-xl border border-border p-5">
            <h2 className="font-semibold">{pillar.en}</h2>
            <p className="text-sm text-muted-foreground">{pillar.sw}</p>
            <p className="mt-2 text-sm text-muted-foreground">
              {PILLAR_DESCRIPTIONS[pillar.key]}
            </p>
          </div>
        ))}
      </section>

      <section className="rounded-xl border border-border p-5 text-sm">
        <h2 className="mb-3 font-semibold">Platform setup status</h2>
        <ul className="flex flex-col gap-2 text-muted-foreground">
          <li>
            {supabaseConfigured ? "●" : "○"} Supabase —{" "}
            {supabaseConfigured ? "connected, migrations applied" : "awaiting credentials"}
          </li>
          <li>
            {aiConfigured ? "●" : "○"} Moonshot Kimi AI —{" "}
            {aiConfigured ? "configured" : "awaiting MOONSHOT_API_KEY"}
          </li>
        </ul>
      </section>
    </main>
  );
}

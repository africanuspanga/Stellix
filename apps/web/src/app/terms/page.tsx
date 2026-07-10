import type { Metadata } from "next";
import Link from "next/link";
import { LogoIcon } from "@/components/logo";

export const metadata: Metadata = { title: "Terms of Service — Stellix" };

// DRAFT prepared for review by Tanzanian counsel before general availability.
export default function TermsPage() {
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-8 px-6 py-16">
      <Link href="/" className="flex items-center gap-2">
        <LogoIcon className="size-5" />
        <span className="font-semibold tracking-tight">Stellix</span>
      </Link>

      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-semibold tracking-tight">Terms of Service</h1>
        <p className="font-mono text-xs uppercase tracking-widest text-muted-foreground">
          Draft — under review by counsel · Last updated July 2026
        </p>
      </div>

      <div className="flex flex-col gap-6 text-sm leading-relaxed text-muted-foreground [&_h2]:text-base [&_h2]:font-semibold [&_h2]:text-foreground">
        <section className="flex flex-col gap-2">
          <h2>The service</h2>
          <p>
            Stellix provides workforce management and payroll software for
            employers in Tanzania. Your company workspace, its data and its
            users remain yours; you grant us the rights needed to operate the
            service on your behalf.
          </p>
        </section>

        <section className="flex flex-col gap-2">
          <h2>Your responsibilities</h2>
          <p>
            You confirm the employee data you load is accurate and lawfully
            collected, that you hold the authority to process it, and that
            statutory filings and payments to authorities (TRA, NSSF, WCF)
            remain your legal responsibility. Stellix computes deterministic
            payroll from versioned statutory rules; you review and approve
            every run before anything is paid.
          </p>
        </section>

        <section className="flex flex-col gap-2">
          <h2>AI features</h2>
          <p>
            AI assistants explain data and draft content under the permissions
            of the person using them. AI never approves payroll, releases
            payments, changes salaries or terminates employment — those
            actions always require an authorised human. All AI activity is
            logged and inspectable in your workspace.
          </p>
        </section>

        <section className="flex flex-col gap-2">
          <h2>Acceptable use &amp; termination</h2>
          <p>
            No unlawful use, no attempts to access other companies&rsquo;
            data, no reselling without agreement. You may export your data and
            close your workspace at any time; we retain what Tanzanian law
            requires (payroll and statutory records) for the mandated periods.
          </p>
        </section>

        <section className="flex flex-col gap-2">
          <h2>Liability</h2>
          <p>
            The service is provided with reasonable skill and care. To the
            extent permitted by law, our aggregate liability is limited to the
            fees paid in the twelve months preceding the claim. Nothing limits
            liability that cannot lawfully be limited.
          </p>
        </section>

        <section className="flex flex-col gap-2">
          <h2>Contact</h2>
          <p>
            Questions about these terms:{" "}
            <a className="text-foreground underline" href="mailto:africanuspanga@gmail.com">
              africanuspanga@gmail.com
            </a>
            . See also our{" "}
            <Link className="text-foreground underline" href="/privacy">
              Privacy Policy
            </Link>
            .
          </p>
        </section>
      </div>
    </main>
  );
}

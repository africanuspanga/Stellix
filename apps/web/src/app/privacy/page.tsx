import type { Metadata } from "next";
import Link from "next/link";
import { LogoIcon } from "@/components/logo";

export const metadata: Metadata = { title: "Privacy Policy — Stellix" };

// DRAFT prepared for review by Tanzanian counsel before general availability.
// Aligned with the Personal Data Protection Act, 2022 (PDPA) and its 2023
// regulations. Do not treat as final legal text until counsel signs off.
export default function PrivacyPage() {
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-8 px-6 py-16">
      <Link href="/" className="flex items-center gap-2">
        <LogoIcon className="size-5" />
        <span className="font-semibold tracking-tight">Stellix</span>
      </Link>

      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-semibold tracking-tight">Privacy Policy</h1>
        <p className="font-mono text-xs uppercase tracking-widest text-muted-foreground">
          Draft — under review by counsel · Last updated July 2026
        </p>
      </div>

      <div className="flex flex-col gap-6 text-sm leading-relaxed text-muted-foreground [&_h2]:text-base [&_h2]:font-semibold [&_h2]:text-foreground">
        <section className="flex flex-col gap-2">
          <h2>Who we are</h2>
          <p>
            Stellix (&ldquo;we&rdquo;) provides a workforce and payroll
            platform to employers in Tanzania. For employee personal data
            entered into the platform, the employer (our customer) is the
            data controller and Stellix acts as a data processor under the
            Personal Data Protection Act, 2022 (PDPA). For account data of the
            people who sign up, Stellix is the controller.
          </p>
        </section>

        <section className="flex flex-col gap-2">
          <h2>What we process</h2>
          <p>
            Employment records your employer maintains: identity details
            (including NIDA number and TIN where captured), contact details,
            employment history, compensation and payroll results, bank or
            mobile-money payout details, leave and attendance records, and
            statutory contribution numbers (NSSF, health insurance). We process
            this solely to operate HR and payroll for your employer — never for
            advertising, and we do not sell personal data.
          </p>
        </section>

        <section className="flex flex-col gap-2">
          <h2>How it is protected</h2>
          <p>
            Data is stored with per-company isolation enforced at the database
            layer (row-level security), with sensitive records (salary, bank
            details) additionally restricted by role. Every access to write and
            every payroll decision is recorded in an immutable audit trail. AI
            features operate under the same permissions as the person using
            them and every AI interaction is logged.
          </p>
        </section>

        <section className="flex flex-col gap-2">
          <h2>Your rights (PDPA)</h2>
          <p>
            You may request access to, correction of, or deletion of your
            personal data, and object to processing, by contacting your
            employer&rsquo;s HR office (the controller) or us. Statutory
            payroll records are retained for the periods Tanzanian law
            requires even after employment ends.
          </p>
        </section>

        <section className="flex flex-col gap-2">
          <h2>Sub-processors &amp; transfers</h2>
          <p>
            We use Supabase (database, authentication, file storage) and
            Moonshot AI (language model for explanations). Personal data used
            in AI explanations is limited to what the requesting user is
            already permitted to see. Where processing occurs outside
            Tanzania, we rely on contractual safeguards consistent with the
            PDPA&rsquo;s cross-border transfer requirements.
          </p>
        </section>

        <section className="flex flex-col gap-2">
          <h2>Contact</h2>
          <p>
            Data questions:{" "}
            <a className="text-foreground underline" href="mailto:africanuspanga@gmail.com">
              africanuspanga@gmail.com
            </a>
            . You may also lodge a complaint with the Personal Data Protection
            Commission (PDPC) of Tanzania.
          </p>
        </section>
      </div>
    </main>
  );
}

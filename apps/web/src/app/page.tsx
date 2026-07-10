import Link from "next/link";
import { PILLARS } from "@hr/config";
import { Header } from "@/components/header";
import { HeroSection } from "@/components/hero";
import { LogoIcon } from "@/components/logo";
import { productLinks } from "@/components/nav-links";

export default function Home() {
  return (
    <div className="relative flex min-h-svh flex-col">
      <Header />

      <main className="flex-1">
        <HeroSection />

        {/* Six pillars — one platform, the whole employee lifecycle. */}
        <section className="mx-auto w-full max-w-5xl px-4 py-20" id="pillars">
          <div className="mb-10 flex flex-col gap-2">
            <p className="font-mono text-xs uppercase tracking-widest text-muted-foreground">
              The platform
            </p>
            <h2 className="max-w-xl text-balance font-semibold text-3xl tracking-tight md:text-4xl">
              Six pillars. One employee record. Zero spreadsheets.
            </h2>
          </div>
          <div className="grid gap-px overflow-hidden rounded-xl border bg-border sm:grid-cols-2 lg:grid-cols-3">
            {PILLARS.map((pillar, i) => {
              const nav = productLinks[i];
              return (
                <div
                  className="flex flex-col gap-2 bg-background p-6 transition-colors hover:bg-muted/50"
                  key={pillar.key}
                >
                  <div className="text-foreground [&_svg]:size-5">
                    {nav?.icon}
                  </div>
                  <h3 className="font-medium">{pillar.en}</h3>
                  <p className="text-sm text-muted-foreground">
                    {nav?.description}
                  </p>
                  <p className="mt-auto pt-2 font-mono text-xs text-muted-foreground">
                    {pillar.sw}
                  </p>
                </div>
              );
            })}
          </div>
        </section>

        {/* Compliance band — the reason to trust the payroll. */}
        <section className="border-y bg-muted/30">
          <div className="mx-auto flex w-full max-w-5xl flex-col gap-8 px-4 py-16 md:flex-row md:items-center md:justify-between">
            <div className="flex max-w-xl flex-col gap-2">
              <p className="font-mono text-xs uppercase tracking-widest text-muted-foreground">
                Built for Tanzania
              </p>
              <h2 className="text-balance font-semibold text-2xl tracking-tight md:text-3xl">
                Statutory rules as versioned data — never hard-coded.
              </h2>
              <p className="text-sm text-muted-foreground md:text-base">
                Effective-dated compliance packs for Mainland and Zanzibar.
                Deterministic payroll with a full calculation trace, immutable
                once approved. AI explains every line — it never calculates pay.
              </p>
            </div>
            <ul className="grid shrink-0 grid-cols-2 gap-x-10 gap-y-3 font-mono text-sm md:grid-cols-1">
              <li>PAYE</li>
              <li>NSSF</li>
              <li>SDL</li>
              <li>WCF</li>
            </ul>
          </div>
        </section>
      </main>

      <footer className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-12 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2">
          <LogoIcon className="size-5" />
          <span className="font-semibold tracking-tight">Stellix</span>
          <span className="text-sm text-muted-foreground">
            — Powering Africa&apos;s Workforce
          </span>
        </div>
        <nav className="flex flex-wrap items-center gap-5 text-sm text-muted-foreground">
          <Link className="hover:text-foreground" href="/login">
            Sign in
          </Link>
          <Link className="hover:text-foreground" href="/signup">
            Create workspace
          </Link>
          <Link className="hover:text-foreground" href="/privacy">
            Privacy
          </Link>
          <Link className="hover:text-foreground" href="/terms">
            Terms
          </Link>
          <a
            className="hover:text-foreground"
            href="https://github.com/africanuspanga/Stellix"
          >
            GitHub
          </a>
        </nav>
      </footer>
    </div>
  );
}

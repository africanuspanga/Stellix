import { redirect } from "next/navigation";
import Link from "next/link";
import { getTenancyContext } from "@/lib/tenancy/context";
import { isPlatformOwner } from "@/lib/platform/owner";
import { LogoIcon } from "@/components/logo";

// The platform-owner console is separate from the tenant workspace: it is
// gated by app.is_platform_owner(), not tenant membership.
export default async function OwnerLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const ctx = await getTenancyContext();
  if (!ctx) redirect("/login");
  if (!(await isPlatformOwner())) redirect("/dashboard");

  return (
    <div className="flex min-h-svh flex-col">
      <header className="sticky top-0 z-50 flex h-14 items-center justify-between border-b bg-background/95 px-4 backdrop-blur-sm md:px-6">
        <Link className="flex items-center gap-2" href="/owner">
          <LogoIcon className="size-5" />
          <span className="font-semibold tracking-tight">Stellix</span>
          <span className="rounded-md border px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
            Platform
          </span>
        </Link>
        <div className="flex items-center gap-4 text-sm">
          <Link className="text-muted-foreground hover:text-foreground" href="/dashboard">
            My workspace
          </Link>
          <span className="text-muted-foreground">{ctx.user.email}</span>
        </div>
      </header>
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 md:px-6">
        {children}
      </main>
    </div>
  );
}

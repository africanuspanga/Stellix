import type { Metadata } from "next";
import { createAdminClient } from "@/lib/supabase/admin";
import { AuthCard } from "@/components/auth/auth-card";
import { AcceptInviteForm } from "@/components/auth/accept-invite-form";

export const metadata: Metadata = { title: "Join your workplace — Stellix" };

export default async function InvitePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  // Public page: look up the invite with the service role, expose only
  // first-name-level information before acceptance.
  const admin = createAdminClient();
  const { data: invite } = await admin
    .from("employee_invites")
    .select("expires_at, accepted_at, employees(first_name, work_email, personal_email), tenants(name)")
    .eq("token", token)
    .maybeSingle();

  const employee = invite?.employees as {
    first_name?: string; work_email?: string | null; personal_email?: string | null;
  } | null;
  const tenant = invite?.tenants as { name?: string } | null;

  const invalid =
    !invite ||
    invite.accepted_at !== null ||
    new Date(invite.expires_at as string).getTime() < Date.now();

  if (invalid) {
    return (
      <AuthCard subtitle="This invite link is not valid" title="Invite unavailable">
        <p className="text-sm text-muted-foreground">
          The link may have expired or already been used. Ask your HR office
          for a new invite. / Kiungo kimekwisha muda au kimeshatumika — omba
          kipya kutoka HR.
        </p>
      </AuthCard>
    );
  }

  const knownEmail = employee?.work_email || employee?.personal_email || "";

  return (
    <AuthCard
      subtitle={`${tenant?.name ?? "Your company"} invited you to Stellix / umealikwa kujiunga`}
      title={`Karibu, ${employee?.first_name ?? ""}!`}
    >
      <AcceptInviteForm knownEmail={knownEmail} token={token} />
    </AuthCard>
  );
}

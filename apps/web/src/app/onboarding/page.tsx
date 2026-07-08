import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AuthCard } from "@/components/auth/auth-card";
import { OnboardingForm } from "@/components/auth/onboarding-form";
import { getTenancyContext } from "@/lib/tenancy/context";

export const metadata: Metadata = { title: "Set up your organization — Stellix" };

export default async function OnboardingPage() {
  const context = await getTenancyContext();
  if (!context) redirect("/login");
  // Already a member of a tenant → nothing to onboard.
  if (context.tenants.length > 0) redirect("/dashboard");

  return (
    <AuthCard
      title="Set up your organization"
      subtitle="This creates your company workspace, legal entity and default roles"
    >
      <OnboardingForm />
    </AuthCard>
  );
}

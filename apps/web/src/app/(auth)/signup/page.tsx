import type { Metadata } from "next";
import { AuthCard } from "@/components/auth/auth-card";
import { SignupForm } from "@/components/auth/signup-form";

export const metadata: Metadata = { title: "Create account — Stellix" };

export default function SignupPage() {
  return (
    <AuthCard
      title="Create your account"
      subtitle="Set up your organization on Stellix"
    >
      <SignupForm />
    </AuthCard>
  );
}

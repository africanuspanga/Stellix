import type { Metadata } from "next";
import { AuthCard } from "@/components/auth/auth-card";
import { LoginForm } from "@/components/auth/login-form";

export const metadata: Metadata = { title: "Sign in — Stellix" };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string }>;
}) {
  const { next, error } = await searchParams;
  return (
    <AuthCard
      title="Welcome back"
      subtitle="Sign in to your Stellix workspace"
    >
      <LoginForm
        next={next}
        initialError={
          error === "confirmation"
            ? "That confirmation link is invalid or has expired. Sign in or request a new one."
            : undefined
        }
      />
    </AuthCard>
  );
}

import type { NextConfig } from "next";

// Production security headers. CSP is deferred until the asset origins settle
// (hero screenshots, Supabase storage) — add it before GA.
const securityHeaders = [
  // Force HTTPS for two years, including subdomains.
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
  // An HR/payroll app must never render inside someone else's frame.
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // We use none of these sensors; say so explicitly.
  { key: "Permissions-Policy", value: "camera=(), microphone=(), payment=(), usb=()" },
];

const nextConfig: NextConfig = {
  // Workspace packages ship TypeScript source directly.
  transpilePackages: ["@hr/config", "@hr/ai"],
  async headers() {
    return [{ source: "/(.*)", headers: securityHeaders }];
  },
};

export default nextConfig;

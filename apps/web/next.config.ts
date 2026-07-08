import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Workspace packages ship TypeScript source directly.
  transpilePackages: ["@hr/config", "@hr/ai"],
};

export default nextConfig;

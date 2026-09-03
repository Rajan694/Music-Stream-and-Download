import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Emit a self-contained standalone output for Docker deployment.
  // No node_modules copy required — Next.js bundles only what's needed.
  output: "standalone",
  devIndicators: false,
};

export default nextConfig;

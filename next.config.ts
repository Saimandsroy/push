import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  // Avoid failing production builds due to ESLint warnings/errors.
  // Cloudflare Pages build via next-on-pages runs a production build under the hood.
  eslint: {
    ignoreDuringBuilds: true,
  },
};

export default nextConfig;

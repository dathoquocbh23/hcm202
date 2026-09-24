import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  turbopack: { root: process.cwd() },
  // Keep the dev-mode badge out of projector and stream captures.
  devIndicators: false
};

export default nextConfig;

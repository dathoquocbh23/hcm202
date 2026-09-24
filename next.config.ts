import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  serverExternalPackages: ['node:sqlite'],
  turbopack: { root: process.cwd() },
  // Keep the dev-mode badge out of projector and stream captures.
  devIndicators: false
};

export default nextConfig;

import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  output: 'standalone',
  transpilePackages: [
    '@kitsuneos/ui',
    '@kitsuneos/core',
    '@kitsuneos/graphql',
    '@kitsuneos/server',
    '@kitsuneos/provisioning',
    '@kitsuneos/mcp',
  ],
};

export default nextConfig;

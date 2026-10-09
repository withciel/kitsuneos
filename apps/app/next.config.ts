import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  output: 'standalone',
  transpilePackages: [
    '@kitsuneos/ui',
    '@kitsuneos/core',
    '@kitsuneos/graphql',
    '@kitsuneos/server',
    '@kitsuneos/provisioning',
    '@kitsuneos/workos',
    '@kitsuneos/mcp',
  ],
  async rewrites() {
    const authkitDomain = process.env.WORKOS_AUTHKIT_DOMAIN?.trim();
    if (!authkitDomain) return [];
    return [
      {
        source: '/auth.md',
        destination: `https://${authkitDomain.replace(/^https?:\/\//, '')}/agent/auth.md`,
      },
    ];
  },
};

export default nextConfig;

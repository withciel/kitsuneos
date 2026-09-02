import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  transpilePackages: ['@kitsuneos/ui', '@kitsuneos/core', '@kitsuneos/server'],
};

export default nextConfig;

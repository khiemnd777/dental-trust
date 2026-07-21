import { resolve } from 'node:path';

try {
  process.loadEnvFile(
    process.env.DENTAL_TRUST_ENV_FILE ?? resolve(import.meta.dirname, '../../.env'),
  );
} catch (error) {
  if (!(error instanceof Error) || !('code' in error) || error.code !== 'ENOENT') throw error;
}

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  poweredByHeader: false,
  reactStrictMode: true,
  transpilePackages: ['@dental-trust/ui'],
  experimental: {
    proxyClientMaxBodySize: '256kb',
    serverActions: { bodySizeLimit: '256kb' },
  },
  async headers() {
    return [{ source: '/:path*', headers: securityHeaders }];
  },
};

const securityHeaders = [
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'no-referrer' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
];

export default nextConfig;

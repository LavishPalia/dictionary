// Everything is self-hosted and the app makes no third-party requests, so the policy can be strict.
// 'unsafe-inline' stays for scripts and styles until nonces are added (Next's inline bootstrap scripts need it).
const csp = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  "connect-src 'self'",
  "worker-src 'self'",
  "manifest-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join('; ');

const securityHeaders = [
  { key: 'Content-Security-Policy', value: csp },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
];

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Panna never uses next/image; turning the optimiser off removes the /_next/image endpoint.
  images: { unoptimized: true },
  async headers() {
    return [{ source: '/:path*', headers: securityHeaders }];
  },
  experimental: {
    // better-sqlite3 is a native module: load it from node_modules at runtime instead of bundling it.
    serverComponentsExternalPackages: ['better-sqlite3'],
    // Ship the generated database with every server route ('/**' — '/*' would miss the root page).
    outputFileTracingIncludes: {
      '/**': ['./data/dictionary.db'],
    },
  },
};

export default nextConfig;

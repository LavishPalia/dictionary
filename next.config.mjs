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
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(self), geolocation=()' },
];

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Panna never uses next/image; turning the optimiser off removes the /_next/image endpoint.
  images: { unoptimized: true },
  // Which Vercel deploy this is ('production', 'preview', or '' locally), for the Duel's pre-launch hiding
  // (src/duel/platform/web/entry.ts), without relying on Vercel exposing its system variables to the browser.
  env: { NEXT_PUBLIC_DUEL_ENV: process.env.VERCEL_ENV ?? '' },
  async headers() {
    return [
      { source: '/:path*', headers: securityHeaders },
      // Duel puzzles are published under their hash, so a name never changes content.
      { source: '/duel/p/:file*', headers: [{ key: 'Cache-Control', value: 'public, max-age=31536000, immutable' }] },
    ];
  },
  // better-sqlite3 is a native module: load it from node_modules at runtime instead of bundling it.
  serverExternalPackages: ['better-sqlite3'],
  // Ship the generated database with every server route ('/**' — '/*' would miss the root page).
  outputFileTracingIncludes: {
    '/**': ['./data/dictionary.db'],
    // What the Duel's server reads: the published puzzles to replay games on, and the word lists for names.
    '/api/duel/games': ['./data/duel/puzzles/**', './data/duel/published.json'],
    '/api/duel/players': ['./data/sources/blocklist.txt', './data/duel/names-blocked.txt'],
    '/api/duel/players/me': ['./data/sources/blocklist.txt', './data/duel/names-blocked.txt'],
  },
};

export default nextConfig;

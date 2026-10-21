/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
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

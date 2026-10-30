/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: {
    // native SQLite driver must not be bundled
    serverComponentsExternalPackages: ['better-sqlite3'],
  },
};
export default nextConfig;

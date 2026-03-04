/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Keep dev and production build artifacts separate to avoid cache corruption
  // when running `next dev` and `next build` in the same worktree.
  distDir: process.env.NODE_ENV === 'development' ? '.next-dev' : '.next',
};

export default nextConfig;

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  reactStrictMode: true,
  webpack: (config, { dev }) => {
    // Docker bind mount บน Windows ไม่ส่ง fs events → ใช้ polling
    if (dev && process.env.WATCHPACK_POLLING === 'true') {
      config.watchOptions = { poll: 1000, aggregateTimeout: 300 };
    }
    return config;
  },
};
export default nextConfig;

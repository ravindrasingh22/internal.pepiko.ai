/** @type {import('next').NextConfig} */
const nextConfig = {
  poweredByHeader: false,
  reactStrictMode: false,
  allowedDevOrigins: [
    "platform.pepiko.local",
    "platform.pepiko.local:8080",
    "internal.pepiko.local",
    "internal.pepiko.local:8080",
    "localhost:8080",
  ],
  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination: `${process.env.CORE_API_BASE || "http://localhost:8000"}/api/:path*`,
      },
    ];
  },
};

module.exports = nextConfig;

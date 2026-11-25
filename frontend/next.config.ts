import type { NextConfig } from "next";

const API_ORIGIN = process.env.INDIGOQ_API_URL ?? "http://127.0.0.1:8787";

const nextConfig: NextConfig = {
  devIndicators: false,
  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination: `${API_ORIGIN}/api/:path*`,
      },
    ];
  },
};

export default nextConfig;

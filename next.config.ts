import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  reactStrictMode: true,
  // 允许用独立构建目录跑并行实例/测试，避免与主构建互相覆盖。
  distDir: process.env.NEXT_DIST_DIR || ".next",
  serverExternalPackages: [
    "pg",
    "@electric-sql/pglite",
    "bcryptjs",
    "puppeteer-core",
    "nodemailer",
  ],
  async headers() {
    return [
      {
        // Captured template snapshots and their assets never change in place.
        source: "/template-pages/:path*",
        headers: [
          { key: "Cache-Control", value: "public, max-age=31536000, immutable" },
        ],
      },
      {
        source: "/template-thumbs/:path*",
        headers: [
          { key: "Cache-Control", value: "public, max-age=31536000, immutable" },
        ],
      },
      {
        source: "/wondercv-assets/:path*",
        headers: [
          { key: "Cache-Control", value: "public, max-age=31536000, immutable" },
        ],
      },
      {
        source: "/template-content/:path*",
        headers: [
          { key: "Cache-Control", value: "public, max-age=31536000, immutable" },
        ],
      },
      {
        // 3.7 MB catalog: reuse for a day, refresh in the background.
        source: "/template-catalog.json",
        headers: [
          {
            key: "Cache-Control",
            value: "public, max-age=86400, stale-while-revalidate=604800",
          },
        ],
      },
    ];
  },
};

export default nextConfig;

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
        // 预渲染 HTML 不能长缓存：它引用带哈希的 chunk，重新构建后旧 HTML 会请求
        // 已不存在的 chunk（静态资源 400），模板库会一直停在骨架屏/加载动画。
        // 交给 CDN 缓存但必须每次回源校验（304 很便宜），部署后自动失效。
        source: "/",
        headers: [
          { key: "Cache-Control", value: "public, max-age=0, must-revalidate" },
        ],
      },
      {
        source: "/templates",
        headers: [
          { key: "Cache-Control", value: "public, max-age=0, must-revalidate" },
        ],
      },
      {
        source: "/templates/:path*",
        headers: [
          { key: "Cache-Control", value: "public, max-age=0, must-revalidate" },
        ],
      },
      {
        source: "/resumes",
        headers: [
          { key: "Cache-Control", value: "public, max-age=0, must-revalidate" },
        ],
      },
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

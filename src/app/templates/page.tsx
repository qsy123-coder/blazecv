import type { Metadata } from "next";
import Link from "next/link";
import { TemplateCatalog } from "@/components/templates/TemplateCatalog";
import { getCatalog } from "@/lib/catalog-server";
import { OG_IMAGE, SITE_NAME } from "@/lib/seo";

const TITLE = "全部简历模板 · 4127 套免费在线简历模板";
const DESC =
  "浏览 4127 套简历模板：单栏、侧栏、时间轴、横幅、深色、分栏、标签等版式，覆盖应届生、社招、技术、运营、设计、教师、金融等用途。原站模板 1:1 渲染，在线编辑并导出 PDF、PNG、Word。";

export const metadata: Metadata = {
  title: TITLE,
  description: DESC,
  alternates: { canonical: "/templates" },
  keywords: [
    "全部简历模板",
    "简历模板库",
    "免费简历模板",
    "应届生简历模板",
    "社招简历模板",
    "单栏简历模板",
    "侧栏简历模板",
    "时间轴简历模板",
  ],
  openGraph: {
    type: "website",
    locale: "zh_CN",
    siteName: SITE_NAME,
    title: TITLE,
    description: DESC,
    url: "/templates",
    images: [OG_IMAGE],
  },
  twitter: {
    card: "summary_large_image",
    title: TITLE,
    description: DESC,
    images: [OG_IMAGE.url],
  },
};

export default async function TemplatesPage() {
  const catalog = await getCatalog().catch(() => null);
  const popular = catalog?.templates.slice(0, 36) ?? [];

  const seoLinks =
    popular.length > 0 ? (
      <section className="mt-12 rounded-2xl border border-slate-200 bg-white p-6">
        <h2 className="text-[18px] font-semibold tracking-tight text-slate-900">
          热门简历模板
        </h2>
        <p className="mt-1.5 text-[12px] leading-5 text-slate-500">
          按模板库顺序整理的热门模板，点击可查看模板详情、示例内容与 A4 预览。
          找不到合适的版式时，可在上方使用版式与用途筛选，或搜索模板名称。
        </p>
        <div className="mt-4 grid gap-x-6 gap-y-2 sm:grid-cols-2 lg:grid-cols-3">
          {popular.map((entry) => (
            <Link
              key={entry.id}
              href={`/templates/${entry.token}`}
              className="truncate text-[12px] text-slate-600 transition hover:text-blue-600 hover:underline"
            >
              {entry.sourceName || entry.name}
            </Link>
          ))}
        </div>
      </section>
    ) : null;

  return <TemplateCatalog seoLinks={seoLinks} />;
}

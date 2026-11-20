import type { Metadata } from "next";
import Link from "next/link";
import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";
import { GUIDES, guideHref, readingMinutes } from "@/lib/guides";
import { OG_IMAGE, SITE_NAME, SITE_URL, pageAlternates } from "@/lib/seo";

const TITLE = "写简历指南 · 应届生、校招与社招简历写法";
const DESC =
  "BlazeCV 写简历指南：应届生没有实习怎么写、校招简历模板怎么选、一页还是两页、项目经历与技能怎么写。每篇附可直接使用的简历模板与示例。";

export const metadata: Metadata = {
  title: TITLE,
  description: DESC,
  alternates: pageAlternates("/guides"),
  keywords: [
    "写简历指南",
    "应届生简历怎么写",
    "校招简历模板",
    "一页简历",
    "简历自我评价",
    "简历项目经历",
    "实习经历怎么写",
    "简历技能怎么写",
    "简历照片",
    "简历命名",
    "简历模板怎么选",
  ],
  openGraph: {
    type: "website",
    locale: "zh_CN",
    siteName: SITE_NAME,
    title: TITLE,
    description: DESC,
    url: "/guides",
    images: [OG_IMAGE],
  },
  twitter: {
    card: "summary_large_image",
    title: TITLE,
    description: DESC,
    images: [OG_IMAGE.url],
  },
};

export default function GuidesPage() {
  const jsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "CollectionPage",
        "@id": `${SITE_URL}/guides#collection`,
        name: TITLE,
        description: DESC,
        url: `${SITE_URL}/guides`,
        inLanguage: "zh-CN",
        mainEntity: {
          "@type": "ItemList",
          numberOfItems: GUIDES.length,
          itemListElement: GUIDES.map((guide, index) => ({
            "@type": "ListItem",
            position: index + 1,
            name: guide.title,
            url: `${SITE_URL}${guideHref(guide.slug)}`,
          })),
        },
      },
      {
        "@type": "BreadcrumbList",
        itemListElement: [
          { "@type": "ListItem", position: 1, name: "首页", item: `${SITE_URL}/` },
          { "@type": "ListItem", position: 2, name: "写简历指南", item: `${SITE_URL}/guides` },
        ],
      },
    ],
  };

  return (
    <div className="min-h-screen bg-slate-50">
      <SiteHeader />

      <main className="mx-auto w-full max-w-[1000px] px-6 py-10">
        <nav
          aria-label="面包屑"
          className="flex items-center gap-1.5 text-[11px] text-slate-400"
        >
          <Link href="/" className="hover:text-slate-700">
            首页
          </Link>
          <span>/</span>
          <span className="text-slate-600">写简历指南</span>
        </nav>

        <header className="mt-5 max-w-2xl">
          <h1 className="text-[30px] font-bold tracking-tight text-slate-900">
            写简历指南
          </h1>
          <p className="mt-3 text-[13px] leading-6 text-slate-500">
            从「写什么」到「怎么排版」：应届生、校招、社招的简历写法与模板选择。
            每篇都给出可直接套用的结构和示例，并链接到对应模板。
          </p>
        </header>

        <div className="mt-8 space-y-4">
          {GUIDES.map((guide) => (
            <Link
              key={guide.slug}
              href={guideHref(guide.slug)}
              className="group block rounded-2xl border border-slate-200 bg-white p-6 transition hover:border-slate-300 hover:shadow-sm"
            >
              <div className="flex flex-wrap items-center gap-2 text-[10px] text-slate-400">
                <span className="rounded-full bg-blue-50 px-2 py-0.5 text-blue-600">
                  {guide.keyword}
                </span>
                <span>更新于 {guide.updated}</span>
                <span>·</span>
                <span>约 {readingMinutes(guide)} 分钟</span>
              </div>
              <h2 className="mt-2 text-[19px] font-bold tracking-tight text-slate-900 group-hover:text-blue-600">
                {guide.title}
              </h2>
              <p className="mt-2 text-[12px] leading-6 text-slate-500">
                {guide.description}
              </p>
              <span className="mt-3 inline-block text-[11px] text-blue-600">
                阅读全文 →
              </span>
            </Link>
          ))}
        </div>

        <section className="mt-10 rounded-2xl border border-slate-200 bg-white p-6">
          <h2 className="text-[16px] font-semibold text-slate-900">先选一份合适的模板</h2>
          <p className="mt-1.5 text-[12px] leading-6 text-slate-500">
            指南里的排版建议都能直接落到模板上。可以按用途浏览
            <Link href="/templates/tag/应届生" className="mx-1 text-blue-600 hover:underline">
              应届生简历模板
            </Link>
            或
            <Link href="/templates/tag/校招" className="mx-1 text-blue-600 hover:underline">
              校招简历模板
            </Link>
            ，也可以进入
            <Link href="/templates" className="mx-1 text-blue-600 hover:underline">
              全部模板库
            </Link>
            按版式筛选。
          </p>
        </section>
      </main>

      <SiteFooter />

      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
    </div>
  );
}

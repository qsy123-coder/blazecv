import type { Metadata } from "next";
import Link from "next/link";
import { TemplateCatalog } from "@/components/templates/TemplateCatalog";
import { getCatalog } from "@/lib/catalog-server";
import { GUIDES, guideHref } from "@/lib/guides";
import {
  LAYOUT_KEYS,
  LAYOUT_LABELS,
  indexableTags,
  layoutHref,
  tagHref,
  tagStats,
} from "@/lib/seo-collections";
import { OG_IMAGE, SITE_NAME, SITE_URL, pageAlternates } from "@/lib/seo";

const TITLE = "个人简历模板 · 4127 套免费在线简历模板";
const DESC =
  "4127 套个人简历模板免费在线编辑：单栏、侧栏、时间轴、横幅、深色、分栏等版式，覆盖应届生、校招、实习、社招、金融、银行、互联网、产品、运营、设计等求职场景。原站模板 1:1 渲染，A4 实时预览；导出 PDF、PNG、Word 为会员功能。";

export const metadata: Metadata = {
  title: TITLE,
  description: DESC,
  alternates: pageAlternates("/templates"),
  keywords: [
    "个人简历模板",
    "全部简历模板",
    "简历模板库",
    "免费简历模板",
    "简历模板下载",
    "简历模板免费下载",
    "简历制作",
    "在线简历制作",
    "应届生简历模板",
    "校招简历模板",
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

  const tagCounts = catalog
    ? new Map(tagStats(catalog).map((row) => [row.tag, row.count]))
    : new Map<string, number>();
  const tags = catalog ? indexableTags(catalog, 24) : [];
  const layouts = catalog
    ? LAYOUT_KEYS.map((key) => ({
        key,
        label: LAYOUT_LABELS[key],
        count: catalog.templates.filter((entry) => entry.layout === key).length,
      })).filter((row) => row.count > 0)
    : [];

  const seoLinks = (
    <>
      {tags.length > 0 ? (
        <section className="mt-8 rounded-2xl border border-slate-200 bg-white p-6">
          <h2 className="text-[18px] font-semibold tracking-tight text-slate-900">
            热门简历模板分类
          </h2>
          <p className="mt-1.5 text-[12px] leading-5 text-slate-500">
            按求职阶段、行业与岗位整理的个人简历模板分类。每个分类都可以查看该用途下的全部模板、
            版式与示例内容，再进入编辑器替换成自己的信息。
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            {tags.map((tag) => (
              <Link
                key={tag}
                href={tagHref(tag)}
                className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-[11px] text-slate-600 transition hover:border-blue-300 hover:bg-white hover:text-blue-600"
              >
                {tag}简历模板
                <span className="ml-1 text-slate-400">{tagCounts.get(tag) ?? 0}</span>
              </Link>
            ))}
          </div>

          <h3 className="mt-6 text-[13px] font-semibold text-slate-800">
            按版式浏览简历模板
          </h3>
          <div className="mt-2 flex flex-wrap gap-2">
            {layouts.map((row) => (
              <Link
                key={row.key}
                href={layoutHref(row.key)}
                className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-[11px] text-slate-600 transition hover:border-blue-300 hover:text-blue-600"
              >
                {row.label}简历模板
                <span className="ml-1 text-slate-400">{row.count}</span>
              </Link>
            ))}
          </div>
        </section>
      ) : null}

      <section className="mt-8 rounded-2xl border border-slate-200 bg-white p-6">
        <h2 className="text-[18px] font-semibold tracking-tight text-slate-900">
          写简历指南
        </h2>
        <p className="mt-1.5 text-[12px] leading-5 text-slate-500">
          选好模板只是第一步。应届生没有实习怎么写、校招模板怎么选、一页还是两页，
          这几篇指南给出可以直接套用的结构和示例。
        </p>
        <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {GUIDES.map((guide) => (
            <Link
              key={guide.slug}
              href={guideHref(guide.slug)}
              className="rounded-lg border border-slate-100 bg-slate-50 px-3 py-2 text-[12px] text-slate-600 transition hover:border-blue-200 hover:bg-white hover:text-blue-600"
            >
              {guide.title}
            </Link>
          ))}
        </div>
      </section>

      {popular.length > 0 ? (
        <section className="mt-8 rounded-2xl border border-slate-200 bg-white p-6">
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
          <p className="mt-4 text-[11px] text-slate-400">
            想一次浏览更多？可以
            <Link
              href="/templates/page/1"
              className="mx-1 text-blue-600 hover:underline"
            >
              分页浏览全部 4127 套模板
            </Link>
            （每页 96 套）；第一次使用还可以查看
            <Link href="/faq" className="mx-1 text-blue-600 hover:underline">
              简历模板常见问题
            </Link>
            ，了解 A4 分页、导出格式与数据保存方式。
          </p>
        </section>
      ) : null}
    </>
  );

  const canonical = `${SITE_URL}/templates`;
  const jsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "CollectionPage",
        "@id": `${canonical}#collection`,
        name: TITLE,
        description: DESC,
        url: canonical,
        inLanguage: "zh-CN",
        isPartOf: { "@type": "WebSite", name: SITE_NAME, url: SITE_URL },
        mainEntity: {
          "@type": "ItemList",
          numberOfItems: catalog?.count ?? popular.length,
          itemListElement: popular.slice(0, 24).map((entry, index) => ({
            "@type": "ListItem",
            position: index + 1,
            name: entry.sourceName || entry.name,
            url: `${SITE_URL}/templates/${entry.token}`,
          })),
        },
      },
      {
        "@type": "BreadcrumbList",
        itemListElement: [
          { "@type": "ListItem", position: 1, name: "首页", item: `${SITE_URL}/` },
          { "@type": "ListItem", position: 2, name: "全部模板库", item: canonical },
        ],
      },
    ],
  };

  return (
    <>
      <TemplateCatalog seoLinks={seoLinks} />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
    </>
  );
}

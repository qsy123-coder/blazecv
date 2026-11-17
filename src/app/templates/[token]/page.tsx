import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { SiteHeader } from "@/components/SiteHeader";
import { UseCatalogTemplate } from "@/components/templates/UseCatalogTemplate";
import { getCatalog, getCatalogTemplate } from "@/lib/catalog-server";
import type { CatalogTemplate } from "@/lib/catalog";
import { OG_IMAGE, SITE_NAME, SITE_URL } from "@/lib/seo";

const LAYOUT_LABEL: Record<string, string> = {
  single: "单栏",
  sidebar: "侧栏",
  timeline: "时间轴",
  banner: "横幅",
  "dark-sidebar": "深色侧栏",
  split: "分栏",
  editorial: "编辑标签栏",
};

export const revalidate = 86400;

function absolute(url: string | null | undefined): string {
  if (!url) return `${SITE_URL}${OG_IMAGE.url}`;
  return /^https?:\/\//i.test(url) ? url : `${SITE_URL}${url}`;
}

function relatedTemplates(
  catalog: Awaited<ReturnType<typeof getCatalog>> | null,
  entry: CatalogTemplate,
): CatalogTemplate[] {
  if (!catalog) return [];
  const rest = catalog.templates.filter((item) => item.id !== entry.id);
  const ranked = rest
    .map((item) => ({
      item,
      score:
        (item.layout === entry.layout ? 2 : 0) +
        item.tags.filter((tag) => entry.tags.includes(tag)).length,
    }))
    .filter((row) => row.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 8)
    .map((row) => row.item);
  if (ranked.length >= 8) return ranked;
  const seen = new Set(ranked.map((item) => item.id));
  for (const item of rest) {
    if (ranked.length >= 8) break;
    if (!seen.has(item.id)) {
      ranked.push(item);
      seen.add(item.id);
    }
  }
  return ranked;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ token: string }>;
}): Promise<Metadata> {
  const { token } = await params;
  const entry = await getCatalogTemplate(token).catch(() => null);
  if (!entry) {
    return { title: "模板未找到", robots: { index: false, follow: false } };
  }
  const sourceName = entry.sourceName || entry.name;
  const label =
    entry.name && entry.name !== sourceName
      ? `${sourceName} - ${entry.name}`
      : sourceName;
  const title = `${label} 简历模板`;
  const description = `${entry.desc || sourceName}。${entry.tags
    .slice(0, 6)
    .join("、")}；支持在线编辑、A4 实时预览，免费导出 PDF、PNG、Word。`;
  return {
    title,
    description,
    keywords: [
      entry.sourceName,
      entry.name,
      ...entry.tags,
      "简历模板",
      "在线简历",
      "免费简历模板",
    ],
    alternates: { canonical: `/templates/${entry.token}` },
    openGraph: {
      type: "website",
      locale: "zh_CN",
      siteName: SITE_NAME,
      title,
      description,
      url: `/templates/${entry.token}`,
      images: [{ ...OG_IMAGE, alt: entry.sourceName }],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [OG_IMAGE.url],
    },
  };
}

export default async function TemplateDetailPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const entry = await getCatalogTemplate(token).catch(() => null);
  if (!entry) notFound();

  const catalog = await getCatalog().catch(() => null);
  const related = relatedTemplates(catalog, entry);
  const canonical = `${SITE_URL}/templates/${entry.token}`;
  const jsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "CreativeWork",
        "@id": `${canonical}#work`,
        name: entry.sourceName,
        alternateName: entry.name,
        description: entry.desc,
        image: absolute(entry.preview),
        url: canonical,
        inLanguage: "zh-CN",
        isPartOf: {
          "@type": "CollectionPage",
          name: "BlazeCV 简历模板库",
          url: `${SITE_URL}/templates`,
        },
      },
      {
        "@type": "BreadcrumbList",
        itemListElement: [
          { "@type": "ListItem", position: 1, name: "首页", item: `${SITE_URL}/` },
          {
            "@type": "ListItem",
            position: 2,
            name: "全部模板库",
            item: `${SITE_URL}/templates`,
          },
          {
            "@type": "ListItem",
            position: 3,
            name: entry.sourceName,
            item: canonical,
          },
        ],
      },
    ],
  };

  return (
    <div className="min-h-screen bg-slate-50">
      <SiteHeader />

      <main className="mx-auto w-full max-w-[1600px] px-6 py-10">
        <nav
          aria-label="面包屑"
          className="flex flex-wrap items-center gap-1.5 text-[11px] text-slate-400"
        >
          <Link href="/" className="hover:text-slate-700">
            首页
          </Link>
          <span>/</span>
          <Link href="/templates" className="hover:text-slate-700">
            全部模板库
          </Link>
          <span>/</span>
          <span className="text-slate-600">{entry.sourceName}</span>
        </nav>

        <div className="mt-6 grid gap-8 lg:grid-cols-[minmax(0,1fr)_420px]">
          <div className="rounded-2xl border border-slate-200 bg-white p-4">
            {entry.preview ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={entry.preview}
                alt={`${entry.sourceName} 简历模板预览`}
                width={720}
                height={1019}
                className="mx-auto h-auto w-full max-w-[720px] rounded-lg border border-slate-100"
              />
            ) : (
              <div className="flex aspect-[210/297] items-center justify-center rounded-lg bg-slate-50 text-[12px] text-slate-400">
                该模板暂无预览图
              </div>
            )}
          </div>

          <aside>
            <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-blue-600">
              {LAYOUT_LABEL[entry.layout] ?? entry.layout} · 在线简历模板
            </p>
            <h1 className="mt-2 text-[28px] font-bold leading-tight tracking-tight text-slate-900">
              {entry.sourceName}
            </h1>
            <p className="mt-1 text-[13px] text-slate-400">{entry.name}</p>
            <p className="mt-4 text-[13px] leading-6 text-slate-600">{entry.desc}</p>

            <div className="mt-4 flex flex-wrap gap-1.5">
              {entry.tags.slice(0, 10).map((tag) => (
                <span
                  key={tag}
                  className="rounded-full bg-white px-2.5 py-1 text-[10px] text-slate-500 ring-1 ring-slate-200"
                >
                  {tag}
                </span>
              ))}
            </div>

            <div className="mt-6 flex flex-wrap items-center gap-3">
              <UseCatalogTemplate entry={entry} />
              <Link
                href="/templates"
                className="text-[12px] text-slate-500 transition hover:text-slate-800"
              >
                返回模板库
              </Link>
            </div>

            <ul className="mt-6 space-y-2 border-t border-slate-200 pt-4 text-[12px] leading-5 text-slate-500">
              <li>· 原站模板 DOM/CSS 1:1 渲染，A4 实时预览</li>
              <li>· 内容实时绑定，免费导出 PDF / PNG / Word</li>
              <li>· 数据仅保存在本机浏览器，无需注册</li>
            </ul>
            {entry.people > 0 ? (
              <p className="mt-3 text-[10px] text-slate-400">
                模板库使用人数参考：
                {entry.people.toLocaleString("zh-CN")}
              </p>
            ) : null}
          </aside>
        </div>

        {related.length > 0 ? (
          <section className="mt-12">
            <h2 className="text-[18px] font-semibold tracking-tight text-slate-900">
              相似简历模板推荐
            </h2>
            <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {related.map((item) => (
                <Link
                  key={item.id}
                  href={`/templates/${item.token}`}
                  className="group overflow-hidden rounded-xl border border-slate-200 bg-white transition hover:border-slate-300 hover:shadow-lg"
                >
                  <div className="aspect-[210/297] overflow-hidden bg-slate-50">
                    {item.preview ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={item.preview}
                        alt={`${item.sourceName} 简历模板`}
                        loading="lazy"
                        className="h-full w-full object-contain"
                      />
                    ) : (
                      <div className="flex h-full items-center justify-center text-[10px] text-slate-300">
                        暂无预览图
                      </div>
                    )}
                  </div>
                  <div className="p-3">
                    <h3 className="truncate text-[12px] font-semibold text-slate-800 transition group-hover:text-blue-600">
                      {item.sourceName}
                    </h3>
                    <p className="mt-0.5 truncate text-[10px] text-slate-400">
                      {item.name}
                    </p>
                  </div>
                </Link>
              ))}
            </div>
          </section>
        ) : null}

        <section className="mt-12 rounded-2xl border border-slate-200 bg-white p-6">
          <h2 className="text-[18px] font-semibold tracking-tight text-slate-900">
            关于这套简历模板
          </h2>
          <div className="mt-3 space-y-2 text-[12px] leading-6 text-slate-500">
            <p>
              「{entry.sourceName}」是一套
              {LAYOUT_LABEL[entry.layout] ?? entry.layout}
              版式的在线简历模板，适合
              {entry.tags.slice(0, 4).join("、") || "各类求职场景"}
              使用。模板保留了原站页面的排版、字号与配色，并对姓名、联系方式、教育、工作、项目与技能等字段做了语义化绑定。
            </p>
            <p>
              在 BlazeCV 中打开模板后，左侧填写内容即可在右侧看到 A4 实时预览；
              支持一键导出 PDF、PNG 和 Word，所有内容默认只保存在你的浏览器中。
              你也可以返回
              <Link
                href="/templates"
                className="mx-1 text-blue-600 hover:underline"
              >
                全部模板库
              </Link>
              按版式或用途继续挑选。
            </p>
          </div>
        </section>
      </main>

      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
    </div>
  );
}

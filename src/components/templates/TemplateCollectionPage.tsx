import Link from "next/link";
import { SiteHeader } from "@/components/SiteHeader";
import type { CatalogTemplate } from "@/lib/catalog";
import { LAYOUT_LABELS } from "@/lib/seo-collections";
import { SITE_NAME, SITE_URL } from "@/lib/seo";

export interface RelatedCollection {
  label: string;
  href: string;
  count?: number;
}

export interface TemplateCollectionPageProps {
  heading: string;
  kicker: string;
  summary: string;
  tips: string[];
  total: number;
  items: CatalogTemplate[];
  breadcrumbLabel: string;
  canonical: string;
  related: RelatedCollection[];
  relatedTitle: string;
  faq?: Array<{ q: string; a: string }>;
}

const SHOWN = 36;

export function TemplateCollectionPage({
  heading,
  kicker,
  summary,
  tips,
  total,
  items,
  breadcrumbLabel,
  canonical,
  related,
  relatedTitle,
  faq,
}: TemplateCollectionPageProps) {
  const shown = items.slice(0, SHOWN);

  const jsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "CollectionPage",
        "@id": `${canonical}#collection`,
        name: heading,
        description: summary,
        url: canonical,
        inLanguage: "zh-CN",
        isPartOf: { "@type": "WebSite", name: SITE_NAME, url: SITE_URL },
        mainEntity: {
          "@type": "ItemList",
          numberOfItems: total,
          itemListElement: shown.slice(0, 24).map((item, index) => ({
            "@type": "ListItem",
            position: index + 1,
            name: item.sourceName,
            url: `${SITE_URL}/templates/${item.token}`,
          })),
        },
      },
      {
        "@type": "BreadcrumbList",
        itemListElement: [
          { "@type": "ListItem", position: 1, name: "首页", item: `${SITE_URL}/` },
          { "@type": "ListItem", position: 2, name: "全部模板库", item: `${SITE_URL}/templates` },
          { "@type": "ListItem", position: 3, name: breadcrumbLabel, item: canonical },
        ],
      },
      ...(faq && faq.length > 0
        ? [
            {
              "@type": "FAQPage",
              mainEntity: faq.map((item) => ({
                "@type": "Question",
                name: item.q,
                acceptedAnswer: { "@type": "Answer", text: item.a },
              })),
            },
          ]
        : []),
    ],
  };

  return (
    <div className="min-h-screen bg-slate-50">
      <SiteHeader />

      <main className="mx-auto w-full max-w-[1600px] px-6 py-10">
        <nav aria-label="面包屑" className="flex flex-wrap items-center gap-1.5 text-[11px] text-slate-400">
          <Link href="/" className="hover:text-slate-700">
            首页
          </Link>
          <span>/</span>
          <Link href="/templates" className="hover:text-slate-700">
            全部模板库
          </Link>
          <span>/</span>
          <span className="text-slate-600">{breadcrumbLabel}</span>
        </nav>

        <header className="mt-5 max-w-3xl">
          <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-blue-600">
            {kicker}
          </p>
          <h1 className="mt-2 text-[30px] font-bold leading-tight tracking-tight text-slate-900">
            {heading}
          </h1>
          <p className="mt-3 text-[13px] leading-6 text-slate-600">{summary}</p>
          <p className="mt-2 text-[11px] text-slate-400">
            共 {total} 套 · 按模板库使用人数排序 · 支持在线编辑、A4 实时预览，免费导出 PDF / PNG / Word
          </p>
        </header>

        <section className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {shown.map((item) => (
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
                    alt={`${item.sourceName} ${breadcrumbLabel}`}
                    loading="lazy"
                    width={720}
                    height={1019}
                    className="h-full w-full object-contain"
                  />
                ) : (
                  <div className="flex h-full items-center justify-center text-[10px] text-slate-300">
                    暂无预览图
                  </div>
                )}
              </div>
              <div className="p-3">
                <h2 className="truncate text-[12px] font-semibold text-slate-800 transition group-hover:text-blue-600">
                  {item.sourceName}
                </h2>
                <p className="mt-1 flex items-center gap-1.5 text-[10px] text-slate-400">
                  <span>{LAYOUT_LABELS[item.layout] ?? item.layout}</span>
                  <span>·</span>
                  <span className="truncate">{item.tags.slice(0, 3).join(" / ") || item.name}</span>
                </p>
              </div>
            </Link>
          ))}
        </section>

        {total > SHOWN ? (
          <div className="mt-6 flex flex-wrap items-center gap-3">
            <Link
              href="/templates"
              className="inline-flex h-10 items-center rounded-md bg-slate-900 px-4 text-[13px] font-medium text-white transition hover:bg-slate-800"
            >
              在模板库中查看全部 {total} 套
            </Link>
            <span className="text-[11px] text-slate-400">
              本页展示使用人数最高的 {SHOWN} 套，其余可在模板库中按版式筛选。
            </span>
          </div>
        ) : null}

        <section className="mt-10 rounded-2xl border border-slate-200 bg-white p-6">
          <h2 className="text-[18px] font-semibold tracking-tight text-slate-900">
            如何挑选{breadcrumbLabel}？
          </h2>
          <ul className="mt-3 space-y-2 text-[12px] leading-6 text-slate-500">
            {tips.map((tip) => (
              <li key={tip} className="flex gap-2">
                <span className="mt-[9px] h-1 w-1 shrink-0 rounded-full bg-blue-500" />
                <span>{tip}</span>
              </li>
            ))}
          </ul>
          <p className="mt-4 text-[12px] leading-6 text-slate-500">
            选好模板后打开编辑器，左侧填写内容即可在右侧看到 A4 实时预览；模板版式、字号、行距与配色均可在「排版与主题」中调整，
            内容超出一页时会自动分页，不会把纸张拉长。不确定内容怎么写，可以先看
            <Link href="/guides" className="mx-1 text-blue-600 hover:underline">
              写简历指南
            </Link>
            。
          </p>
        </section>

        {faq && faq.length > 0 ? (
          <section className="mt-8 rounded-2xl border border-slate-200 bg-white p-6">
            <h2 className="text-[18px] font-semibold tracking-tight text-slate-900">
              {breadcrumbLabel}常见问题
            </h2>
            <div className="mt-4 space-y-4">
              {faq.map((item) => (
                <div key={item.q}>
                  <h3 className="text-[13px] font-semibold text-slate-800">{item.q}</h3>
                  <p className="mt-1.5 text-[12px] leading-6 text-slate-500">{item.a}</p>
                </div>
              ))}
            </div>
          </section>
        ) : null}

        {related.length > 0 ? (
          <section className="mt-8">
            <h2 className="text-[16px] font-semibold tracking-tight text-slate-900">
              {relatedTitle}
            </h2>
            <div className="mt-3 flex flex-wrap gap-2">
              {related.map((entry) => (
                <Link
                  key={entry.href}
                  href={entry.href}
                  className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-[11px] text-slate-600 transition hover:border-blue-300 hover:text-blue-600"
                >
                  {entry.label}
                  {typeof entry.count === "number" ? (
                    <span className="ml-1 text-slate-400">{entry.count}</span>
                  ) : null}
                </Link>
              ))}
            </div>
          </section>
        ) : null}
      </main>

      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
    </div>
  );
}

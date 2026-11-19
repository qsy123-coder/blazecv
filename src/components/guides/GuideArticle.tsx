import Link from "next/link";
import type { ReactNode } from "react";
import { SiteHeader } from "@/components/SiteHeader";
import type { CatalogFile } from "@/lib/catalog";
import { LAYOUT_LABELS } from "@/lib/seo-collections";
import { SITE_NAME, SITE_URL } from "@/lib/seo";
import { GUIDES, guideHref, readingMinutes, type Guide } from "@/lib/guides";

function renderInline(text: string, keyPrefix: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  const pattern = /\[([^\]]+)\]\(([^)]+)\)/g;
  let last = 0;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(text))) {
    if (match.index > last) {
      nodes.push(text.slice(last, match.index));
    }
    const label = match[1];
    const href = match[2];
    if (/^https?:\/\//.test(href)) {
      nodes.push(
        <a
          key={`${keyPrefix}-${match.index}`}
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          className="text-blue-600 hover:underline"
        >
          {label}
        </a>,
      );
    } else {
      nodes.push(
        <Link
          key={`${keyPrefix}-${match.index}`}
          href={href}
          className="text-blue-600 hover:underline"
        >
          {label}
        </Link>,
      );
    }
    last = match.index + match[0].length;
  }
  if (last < text.length) nodes.push(text.slice(last));
  return nodes;
}

export function GuideArticle({
  guide,
  catalog,
}: {
  guide: Guide;
  catalog: CatalogFile | null;
}) {
  const minutes = readingMinutes(guide);
  const canonical = `${SITE_URL}${guideHref(guide.slug)}`;
  const related = GUIDES.filter((item) => item.slug !== guide.slug);

  const jsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Article",
        "@id": `${canonical}#article`,
        headline: guide.title,
        description: guide.description,
        datePublished: guide.date,
        dateModified: guide.updated,
        inLanguage: "zh-CN",
        author: { "@type": "Organization", name: SITE_NAME, url: SITE_URL },
        publisher: { "@type": "Organization", name: SITE_NAME, url: SITE_URL },
        mainEntityOfPage: canonical,
        keywords: [guide.keyword, "简历模板", "简历怎么写"],
        isPartOf: { "@type": "WebSite", name: SITE_NAME, url: SITE_URL },
      },
      {
        "@type": "BreadcrumbList",
        itemListElement: [
          { "@type": "ListItem", position: 1, name: "首页", item: `${SITE_URL}/` },
          { "@type": "ListItem", position: 2, name: "写简历指南", item: `${SITE_URL}/guides` },
          { "@type": "ListItem", position: 3, name: guide.title, item: canonical },
        ],
      },
      {
        "@type": "FAQPage",
        mainEntity: guide.faq.map((item) => ({
          "@type": "Question",
          name: item.q,
          acceptedAnswer: { "@type": "Answer", text: item.a },
        })),
      },
    ],
  };

  return (
    <div className="min-h-screen bg-slate-50">
      <SiteHeader />

      <main className="mx-auto w-full max-w-[860px] px-6 py-10">
        <nav
          aria-label="面包屑"
          className="flex flex-wrap items-center gap-1.5 text-[11px] text-slate-400"
        >
          <Link href="/" className="hover:text-slate-700">
            首页
          </Link>
          <span>/</span>
          <Link href="/guides" className="hover:text-slate-700">
            写简历指南
          </Link>
          <span>/</span>
          <span className="text-slate-600">{guide.title}</span>
        </nav>

        <article>
          <header className="mt-5">
            <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-blue-600">
              写简历指南
            </p>
            <h1 className="mt-2 text-[30px] font-bold leading-tight tracking-tight text-slate-900">
              {guide.title}
            </h1>
            <p className="mt-3 text-[13px] leading-6 text-slate-500">{guide.intro}</p>
            <p className="mt-3 text-[11px] text-slate-400">
              更新于 {guide.updated} · 约 {minutes} 分钟读完 · BlazeCV 编辑部
            </p>
          </header>

          <div className="mt-8 space-y-5">
            {guide.blocks.map((block, index) => {
              const key = `block-${index}`;
              if (block.type === "h2") {
                return (
                  <h2
                    key={key}
                    className="mt-8 text-[20px] font-bold tracking-tight text-slate-900"
                  >
                    {block.text}
                  </h2>
                );
              }
              if (block.type === "h3") {
                return (
                  <h3 key={key} className="mt-5 text-[15px] font-semibold text-slate-800">
                    {block.text}
                  </h3>
                );
              }
              if (block.type === "p") {
                return (
                  <p key={key} className="text-[13px] leading-7 text-slate-600">
                    {renderInline(block.text, key)}
                  </p>
                );
              }
              if (block.type === "ul" || block.type === "ol") {
                const List = block.type === "ul" ? "ul" : "ol";
                return (
                  <List
                    key={key}
                    className="space-y-2 pl-5 text-[13px] leading-7 text-slate-600"
                    style={{ listStyleType: block.type === "ul" ? "disc" : "decimal" }}
                  >
                    {block.items.map((item, itemIndex) => (
                      <li key={`${key}-${itemIndex}`}>{renderInline(item, `${key}-${itemIndex}`)}</li>
                    ))}
                  </List>
                );
              }
              if (block.type === "callout") {
                return (
                  <aside
                    key={key}
                    className="rounded-xl border border-blue-100 bg-blue-50/70 p-4"
                  >
                    {block.title ? (
                      <p className="text-[12px] font-semibold text-blue-800">{block.title}</p>
                    ) : null}
                    <p className="mt-1 text-[12px] leading-6 text-slate-600">
                      {renderInline(block.text, key)}
                    </p>
                  </aside>
                );
              }
              const entries = block.tokens
                .map((token) => catalog?.templates.find((entry) => entry.token === token))
                .filter((entry): entry is NonNullable<typeof entry> => Boolean(entry));
              return (
                <section key={key} className="rounded-2xl border border-slate-200 bg-white p-5">
                  <h2 className="text-[16px] font-semibold tracking-tight text-slate-900">
                    {block.title}
                  </h2>
                  <div className="mt-4 grid gap-3 sm:grid-cols-2">
                    {entries.map((entry) => (
                      <Link
                        key={entry.id}
                        href={`/templates/${entry.token}`}
                        className="group flex gap-3 rounded-xl border border-slate-200 p-2 transition hover:border-slate-300 hover:shadow-sm"
                      >
                        <div className="h-[92px] w-[65px] shrink-0 overflow-hidden rounded bg-slate-50">
                          {entry.preview ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={entry.preview}
                              alt={`${entry.sourceName} 简历模板`}
                              loading="lazy"
                              width={210}
                              height={297}
                              className="h-full w-full object-contain"
                            />
                          ) : null}
                        </div>
                        <div className="min-w-0">
                          <p className="truncate text-[12px] font-semibold text-slate-800 group-hover:text-blue-600">
                            {entry.sourceName}
                          </p>
                          <p className="mt-1 text-[10px] text-slate-400">
                            {LAYOUT_LABELS[entry.layout] ?? entry.layout}版式
                          </p>
                          <p className="mt-1 line-clamp-2 text-[10px] leading-4 text-slate-400">
                            {entry.tags.slice(0, 3).join(" / ")}
                          </p>
                        </div>
                      </Link>
                    ))}
                  </div>
                  <div className="mt-3">
                    <Link
                      href="/templates"
                      className="text-[11px] text-blue-600 hover:underline"
                    >
                      查看全部简历模板 →
                    </Link>
                  </div>
                </section>
              );
            })}
          </div>

          <section className="mt-10 rounded-2xl border border-slate-200 bg-white p-6">
            <h2 className="text-[18px] font-semibold tracking-tight text-slate-900">
              常见问题
            </h2>
            <div className="mt-4 space-y-4">
              {guide.faq.map((item) => (
                <div key={item.q}>
                  <h3 className="text-[13px] font-semibold text-slate-800">{item.q}</h3>
                  <p className="mt-1.5 text-[12px] leading-6 text-slate-500">{item.a}</p>
                </div>
              ))}
            </div>
          </section>

          <section className="mt-8 rounded-2xl bg-slate-900 p-6 text-white">
            <h2 className="text-[16px] font-semibold">用模板把内容落到 A4 上</h2>
            <p className="mt-1.5 text-[12px] leading-6 text-slate-300">
              4127 套模板支持在线编辑、A4 实时预览；免费版带水印导出，会员无水印导出 PDF、PNG 和 Word。
            </p>
            <div className="mt-4 flex flex-wrap gap-3">
              <Link
                href="/templates"
                className="inline-flex h-9 items-center rounded-md bg-white px-4 text-[12px] font-medium text-slate-900"
              >
                浏览全部模板
              </Link>
              <Link
                href="/faq"
                className="inline-flex h-9 items-center rounded-md border border-white/20 px-4 text-[12px] text-slate-200"
              >
                查看常见问题
              </Link>
            </div>
          </section>
        </article>

        {related.length > 0 ? (
          <section className="mt-10">
            <h2 className="text-[16px] font-semibold tracking-tight text-slate-900">
              继续阅读
            </h2>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              {related.map((item) => (
                <Link
                  key={item.slug}
                  href={guideHref(item.slug)}
                  className="rounded-xl border border-slate-200 bg-white p-4 transition hover:border-slate-300 hover:shadow-sm"
                >
                  <p className="text-[13px] font-semibold text-slate-800">{item.title}</p>
                  <p className="mt-1 line-clamp-2 text-[11px] leading-5 text-slate-500">
                    {item.description}
                  </p>
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

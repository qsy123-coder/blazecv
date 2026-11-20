import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";
import { getCatalog } from "@/lib/catalog-server";
import { LAYOUT_LABELS, sortByPopularity } from "@/lib/seo-collections";
import { pageAlternates } from "@/lib/seo";

export const revalidate = 86400;

/** Cards per page. Large enough that ~43 pages cover the whole library. */
const PAGE_SIZE = 96;

export async function generateStaticParams() {
  const catalog = await getCatalog().catch(() => null);
  if (!catalog) return [];
  const pages = Math.max(1, Math.ceil(catalog.templates.length / PAGE_SIZE));
  return Array.from({ length: pages }, (_, index) => ({
    page: String(index + 1),
  }));
}

function parsePage(raw: string): number | null {
  if (!/^\d+$/.test(raw)) return null;
  const value = Number(raw);
  return value >= 1 ? value : null;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ page: string }>;
}): Promise<Metadata> {
  const { page: raw } = await params;
  const page = parsePage(raw);
  if (!page) {
    return { title: "页面不存在", robots: { index: false, follow: false } };
  }
  const title = `全部简历模板 · 第 ${page} 页`;
  const description = `BlazeCV 简历模板库第 ${page} 页，按使用人数排序浏览全部个人简历模板，支持在线编辑、A4 实时预览与 PDF / PNG / Word 导出。`;
  return {
    title,
    description,
    // Paginated views of the same catalog: canonicalise to the filterable
    // catalog page and let crawlers follow every template link from here.
    alternates: pageAlternates("/templates"),
    robots: { index: false, follow: true },
  };
}

export default async function TemplatePageList({
  params,
}: {
  params: Promise<{ page: string }>;
}) {
  const { page: raw } = await params;
  const page = parsePage(raw);
  if (!page) notFound();

  const catalog = await getCatalog().catch(() => null);
  if (!catalog) notFound();

  const ordered = sortByPopularity(catalog.templates);
  const totalPages = Math.max(1, Math.ceil(ordered.length / PAGE_SIZE));
  if (page > totalPages) notFound();

  const start = (page - 1) * PAGE_SIZE;
  const items = ordered.slice(start, start + PAGE_SIZE);

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
          <span className="text-slate-600">第 {page} 页</span>
        </nav>

        <header className="mt-5 max-w-3xl">
          <h1 className="text-[28px] font-bold leading-tight tracking-tight text-slate-900">
            全部简历模板（第 {page} / {totalPages} 页）
          </h1>
          <p className="mt-2 text-[13px] leading-6 text-slate-500">
            共 {ordered.length} 套个人简历模板，按模板库使用人数排序，本页展示第
            {start + 1}–{start + items.length} 套。点击任意模板可以查看示例内容与 A4
            预览，再进入编辑器替换成自己的信息。
          </p>
        </header>

        <section className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {items.map((entry) => (
            <Link
              key={entry.id}
              href={`/templates/${entry.token}`}
              className="group overflow-hidden rounded-xl border border-slate-200 bg-white transition hover:border-slate-300 hover:shadow-lg"
            >
              <div className="aspect-[210/297] overflow-hidden bg-slate-50">
                {entry.preview ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={entry.preview}
                    alt={`${entry.sourceName} 简历模板`}
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
                  {entry.sourceName || entry.name}
                </h2>
                <p className="mt-1 truncate text-[10px] text-slate-400">
                  {LAYOUT_LABELS[entry.layout] ?? entry.layout}
                  <span className="mx-1">·</span>
                  {entry.tags.slice(0, 3).join(" / ") || entry.name}
                </p>
              </div>
            </Link>
          ))}
        </section>

        <nav
          aria-label="模板分页"
          className="mt-8 flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 pt-5 text-[12px]"
        >
          <div className="flex items-center gap-2">
            {page > 1 ? (
              <Link
                href={`/templates/page/${page - 1}`}
                rel="prev"
                className="rounded-md border border-slate-200 bg-white px-3 py-1.5 text-slate-600 transition hover:border-slate-300"
              >
                上一页
              </Link>
            ) : (
              <span className="rounded-md border border-slate-100 bg-slate-50 px-3 py-1.5 text-slate-300">
                上一页
              </span>
            )}
            <span className="text-slate-400">
              第 {page} / {totalPages} 页
            </span>
            {page < totalPages ? (
              <Link
                href={`/templates/page/${page + 1}`}
                rel="next"
                className="rounded-md border border-slate-200 bg-white px-3 py-1.5 text-slate-600 transition hover:border-slate-300"
              >
                下一页
              </Link>
            ) : (
              <span className="rounded-md border border-slate-100 bg-slate-50 px-3 py-1.5 text-slate-300">
                下一页
              </span>
            )}
          </div>
          <Link
            href="/templates"
            className="text-blue-600 transition hover:underline"
          >
            按用途与版式筛选全部模板 →
          </Link>
        </nav>
      </main>

      <SiteFooter />
    </div>
  );
}

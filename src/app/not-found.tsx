import Link from "next/link";
import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";
import { FOOTER_GUIDES, footerGuideHref } from "@/lib/seo-footer";

export default function NotFound() {
  return (
    <div className="min-h-screen bg-slate-50">
      <SiteHeader />

      <main className="mx-auto w-full max-w-[1000px] px-6 py-20">
        <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-blue-600">
          404 · 页面不存在
        </p>
        <h1 className="mt-3 text-[28px] font-bold tracking-tight text-slate-900">
          没有找到这个页面
        </h1>
        <p className="mt-3 max-w-xl text-[13px] leading-6 text-slate-500">
          链接可能已经失效，或者模板已经下架。可以直接从下面的入口继续：
          浏览全部简历模板、按用途或版式挑选，或者先看写简历指南。
        </p>

        <div className="mt-8 flex flex-wrap items-center gap-3">
          <Link
            href="/templates"
            className="inline-flex h-10 items-center rounded-md bg-slate-900 px-4 text-[13px] font-medium text-white transition hover:bg-slate-800"
          >
            浏览全部简历模板
          </Link>
          <Link
            href="/"
            className="text-[12px] text-slate-500 transition hover:text-slate-800"
          >
            返回首页
          </Link>
          <Link
            href="/guides"
            className="text-[12px] text-slate-500 transition hover:text-slate-800"
          >
            写简历指南
          </Link>
        </div>

        <section className="mt-12 rounded-2xl border border-slate-200 bg-white p-6">
          <h2 className="text-[15px] font-semibold text-slate-900">常用指南</h2>
          <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {FOOTER_GUIDES.slice(0, 6).map((guide) => (
              <Link
                key={guide.slug}
                href={footerGuideHref(guide.slug)}
                className="rounded-lg border border-slate-100 bg-slate-50 px-3 py-2 text-[12px] text-slate-600 transition hover:border-blue-200 hover:bg-white hover:text-blue-600"
              >
                {guide.title}
              </Link>
            ))}
          </div>
        </section>
      </main>

      <SiteFooter />
    </div>
  );
}

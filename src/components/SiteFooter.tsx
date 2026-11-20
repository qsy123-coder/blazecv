import Link from "next/link";
import {
  FOOTER_GUIDES,
  FOOTER_LAYOUTS,
  FOOTER_TAGS,
  footerGuideHref,
  footerLayoutHref,
  footerTagHref,
} from "@/lib/seo-footer";

/**
 * Site-wide footer. Rendered on every public page so that search engines can
 * reach the tag / layout / guide landing pages from anywhere on the site, not
 * only from /templates. Pure static data: safe to render inside client
 * components (home page, template catalog) without pulling extra JavaScript.
 */
export function SiteFooter() {
  return (
    <footer className="border-t border-slate-200 bg-white">
      <div className="mx-auto w-full max-w-[1600px] px-6 py-12">
        <div className="grid gap-10 md:grid-cols-2 lg:grid-cols-4">
          <nav aria-label="热门简历模板分类">
            <h2 className="text-[13px] font-semibold text-slate-900">
              热门简历模板分类
            </h2>
            <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1.5">
              {FOOTER_TAGS.map((tag) => (
                <Link
                  key={tag}
                  href={footerTagHref(tag)}
                  className="truncate text-[11px] text-slate-500 transition hover:text-blue-600 hover:underline"
                >
                  {tag}简历模板
                </Link>
              ))}
            </div>
          </nav>

          <nav aria-label="简历模板版式">
            <h2 className="text-[13px] font-semibold text-slate-900">
              按版式浏览模板
            </h2>
            <ul className="mt-3 space-y-1.5">
              {FOOTER_LAYOUTS.map((row) => (
                <li key={row.key}>
                  <Link
                    href={footerLayoutHref(row.key)}
                    className="text-[11px] text-slate-500 transition hover:text-blue-600 hover:underline"
                  >
                    {row.label}简历模板
                  </Link>
                </li>
              ))}
            </ul>
          </nav>

          <nav aria-label="写简历指南">
            <h2 className="text-[13px] font-semibold text-slate-900">写简历指南</h2>
            <ul className="mt-3 space-y-1.5">
              {FOOTER_GUIDES.map((guide) => (
                <li key={guide.slug}>
                  <Link
                    href={footerGuideHref(guide.slug)}
                    className="text-[11px] text-slate-500 transition hover:text-blue-600 hover:underline"
                  >
                    {guide.title}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>

          <div>
            <h2 className="text-[13px] font-semibold text-slate-900">站内导航</h2>
            <ul className="mt-3 space-y-1.5">
              <li>
                <Link
                  href="/templates"
                  className="text-[11px] text-slate-500 transition hover:text-blue-600 hover:underline"
                >
                  全部简历模板库
                </Link>
              </li>
              <li>
                <Link
                  href="/guides"
                  className="text-[11px] text-slate-500 transition hover:text-blue-600 hover:underline"
                >
                  写简历指南
                </Link>
              </li>
              <li>
                <Link
                  href="/faq"
                  className="text-[11px] text-slate-500 transition hover:text-blue-600 hover:underline"
                >
                  常见问题
                </Link>
              </li>
              <li>
                <Link
                  href="/membership"
                  className="text-[11px] text-slate-500 transition hover:text-blue-600 hover:underline"
                >
                  会员与导出
                </Link>
              </li>
              <li>
                <a
                  href="/sitemap.xml"
                  className="text-[11px] text-slate-500 transition hover:text-blue-600 hover:underline"
                >
                  网站地图
                </a>
              </li>
            </ul>
            <p className="mt-4 text-[10px] leading-5 text-slate-400">
              BlazeCV 收录 4127 套简历模板，覆盖单栏、侧栏、时间轴、横幅、深色、分栏与编辑标签栏
              七种版式，支持在线编辑、A4 实时预览与 PDF / PNG / Word 导出。
            </p>
          </div>
        </div>

        <div className="mt-10 flex flex-col items-center justify-between gap-2 border-t border-slate-100 pt-6 text-[10px] text-slate-400 sm:flex-row">
          <span>© 2026 BlazeCV · 在线简历制作与简历模板库</span>
          <span>数据默认只保存在本机浏览器 · 免费编辑与预览</span>
        </div>
      </div>
    </footer>
  );
}

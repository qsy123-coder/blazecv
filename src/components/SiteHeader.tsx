"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { CloudMenu } from "@/components/account/CloudMenu";

const NAV = [
  { href: "/", label: "首页", isActive: (path: string) => path === "/" },
  {
    href: "/templates",
    label: "全部模板库",
    isActive: (path: string) => path.startsWith("/templates"),
  },
  {
    href: "/guides",
    label: "写简历指南",
    isActive: (path: string) => path.startsWith("/guides"),
  },
  {
    href: "/resumes",
    label: "我的简历",
    isActive: (path: string) => path.startsWith("/resumes"),
  },
  {
    href: "/membership",
    label: "会员",
    isActive: (path: string) => path.startsWith("/membership"),
  },
] as const;

/**
 * The site chrome must be byte-for-byte identical on every page. Pages used to
 * each own a slightly different header (different links, order, labels and CTA),
 * so the bar visibly changed on every navigation.
 */
export function SiteHeader() {
  const pathname = usePathname() ?? "/";
  return (
    <header className="sticky top-0 z-40 border-b border-slate-200/80 bg-white/90 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-[1600px] items-center justify-between gap-4 px-6">
        <div className="flex min-w-0 items-center gap-8">
          <Link href="/" className="flex shrink-0 items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-md bg-slate-900 text-[13px] font-bold text-white">
              B
            </div>
            <span className="text-[15px] font-semibold tracking-tight">BlazeCV</span>
          </Link>
          <nav className="hidden items-center gap-6 text-[13px] md:flex">
            {NAV.map((item) =>
              item.isActive(pathname) ? (
                <span key={item.href} aria-current="page" className="text-slate-900">
                  {item.label}
                </span>
              ) : (
                <Link
                  key={item.href}
                  href={item.href}
                  className="text-slate-500 transition hover:text-slate-900"
                >
                  {item.label}
                </Link>
              ),
            )}
          </nav>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <CloudMenu />
          <Link
            href="/#templates"
            className="inline-flex h-9 items-center rounded-md bg-slate-900 px-4 text-[13px] font-medium text-white transition hover:bg-slate-800"
          >
            新建简历
          </Link>
        </div>
      </div>
    </header>
  );
}

"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { CatalogFile, CatalogTemplate } from "@/lib/catalog";
import { presetFromCatalog } from "@/lib/catalog";
import type { LayoutKind } from "@/lib/types";
import { TEMPLATE_GROUPS } from "@/lib/gallery";
import {
  buildTemplateSample,
  loadTemplateContent,
} from "@/lib/template-sample";
import {
  getActiveResumeId,
  listResumes,
  saveResume,
  type ResumeSummary,
} from "@/lib/storage";
import { Icon } from "@/components/icons";
import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";
import { cn, uid } from "@/lib/utils";

const LIBRARY_COUNT = 4127;
const CATALOG_PAGE_SIZE = 24;

const LAYOUT_LABEL: Record<LayoutKind, string> = {
  single: "单栏",
  sidebar: "侧栏",
  timeline: "时间轴",
  banner: "横幅",
  "dark-sidebar": "深色",
  split: "分栏",
  editorial: "标签",
};

// First-screen mockups: picked from the library (not the curated presets).
const HERO_TEMPLATES = [
  { token: "d9d0ec05a0515f93", alt: "应届生通用简历模板" },
  { token: "849264f9e155ddda", alt: "3-5年经验数据运营专家跳槽简历模板" },
  { token: "23edcee9e7c09b89", alt: "3-5年经验高级产品运营跳槽简历模板" },
];

function HeroTemplateThumb({
  token,
  alt,
  width,
  height,
}: {
  token: string;
  alt: string;
  width: number;
  height: number;
}) {
  return (
    <div className="overflow-hidden rounded" style={{ width, height }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={`/template-thumbs/${token}.webp?v=2`}
        alt={alt}
        className="h-full w-full object-cover"
      />
    </div>
  );
}

function CatalogTemplateCard({
  entry,
  creating,
  onUse,
}: {
  entry: CatalogTemplate;
  creating: boolean;
  onUse: (entry: CatalogTemplate) => void;
}) {
  return (
    <button
      type="button"
      data-catalog-card
      data-template-id={entry.id}
      onClick={() => onUse(entry)}
      disabled={creating}
      className="group flex flex-col overflow-hidden rounded-xl border border-slate-200 bg-white text-left transition hover:border-slate-300 hover:shadow-lg disabled:cursor-wait disabled:opacity-70"
    >
      <div className="relative aspect-[210/297] overflow-hidden bg-slate-50">
        {entry.preview ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={entry.preview}
            alt={entry.name}
            loading="lazy"
            className="h-full w-full object-contain"
          />
        ) : (
          <div className="flex h-full flex-col items-center justify-center gap-2 text-slate-300">
            <Icon name="fileText" size={26} />
            <span className="text-[10px]">{LAYOUT_LABEL[entry.layout]} · 无预览图</span>
          </div>
        )}
        <span className="absolute right-2 top-2 z-20 rounded bg-slate-900/85 px-1.5 py-0.5 text-[9px] text-white">
          {LAYOUT_LABEL[entry.layout]}
        </span>
        <div className="absolute inset-x-2 bottom-2 z-20 flex translate-y-1 items-center justify-center gap-1 rounded-md bg-slate-900/90 py-2 text-[11px] font-medium text-white opacity-0 transition group-hover:translate-y-0 group-hover:opacity-100">
          {creating ? "创建中…" : "使用此模板"}
          <Icon name="arrowRight" size={12} />
        </div>
      </div>
      <div className="p-3 pt-2">
        <div className="truncate text-[13px] font-semibold text-slate-800">{entry.name}</div>
        <div className="mt-0.5 truncate text-[10px] text-slate-400">{entry.sourceName}</div>
      </div>
    </button>
  );
}


export function HomePage({ seoContent }: { seoContent?: ReactNode }) {
  const [resumes, setResumes] = useState<ResumeSummary[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [creating, setCreating] = useState<string | null>(null);
  const [filter, setFilter] = useState<"all" | LayoutKind>("all");
  const [tagFilter, setTagFilter] = useState<string | null>(null);
  const [catalog, setCatalog] = useState<CatalogFile | null>(null);
  const [catalogError, setCatalogError] = useState<string | null>(null);
  const [page, setPage] = useState(0);
  const router = useRouter();
  const templatesRef = useRef<HTMLElement>(null);
  const catalogRequested = useRef(false);
  const snapLocked = useRef(false);
  const boundaryLatched = useRef(false);
  const boundaryTimer = useRef<number | null>(null);
  const touchStart = useRef<{ y: number; handled: boolean } | null>(null);

  const entries = catalog?.templates ?? [];
  const libraryCount = catalog?.count ?? LIBRARY_COUNT;

  const tagOptions = useMemo(() => {
    const counts = new Map<string, number>();
    for (const entry of catalog?.templates ?? []) {
      for (const tag of entry.tags ?? []) {
        counts.set(tag, (counts.get(tag) ?? 0) + 1);
      }
    }
    return [...counts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([tag]) => tag);
  }, [catalog]);

  // 首屏与模板市场之间的一次性吸附：
  //  - 在首屏任意一次向下滚动 → 直接平滑到模板市场顶部；
  //  - 模板市场以下保持普通滚动；
  //  - 向上滚动先正常回到模板市场顶部，再向上一次才回首屏。
  useEffect(() => {
    const reduceMotion =
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    const templatesTop = () => {
      const el = templatesRef.current;
      if (!el) return 0;
      return el.getBoundingClientRect().top + window.scrollY;
    };

    const lock = () => {
      snapLocked.current = true;
      window.setTimeout(() => {
        snapLocked.current = false;
      }, reduceMotion ? 60 : 650);
    };

    const go = (top: number) => {
      window.scrollTo({ top, behavior: reduceMotion ? "auto" : "smooth" });
      lock();
    };

    const atHero = () => window.scrollY <= 4;
    const distanceToTemplates = () => window.scrollY - templatesTop();

    const clearBoundary = () => {
      boundaryLatched.current = false;
      if (boundaryTimer.current !== null) {
        window.clearTimeout(boundaryTimer.current);
        boundaryTimer.current = null;
      }
    };

    // Momentum must stop at the templates top: the next deliberate upward
    // gesture (after a short quiet gap / a new touch) is what returns home.
    const latchBoundary = () => {
      boundaryLatched.current = true;
      if (boundaryTimer.current !== null) window.clearTimeout(boundaryTimer.current);
      boundaryTimer.current = window.setTimeout(() => {
        boundaryLatched.current = false;
        boundaryTimer.current = null;
      }, 320);
    };

    const clampToTemplatesTop = () => {
      window.scrollTo({ top: templatesTop(), behavior: "auto" });
      latchBoundary();
    };

    const onWheel = (event: WheelEvent) => {
      if (event.deltaY === 0) return;
      if (snapLocked.current) {
        event.preventDefault();
        return;
      }

      if (atHero() && event.deltaY > 0) {
        event.preventDefault();
        clearBoundary();
        go(templatesTop());
        return;
      }

      if (event.deltaY < 0) {
        const distance = distanceToTemplates();
        if (distance >= 0 && distance <= 2) {
          event.preventDefault();
          if (boundaryLatched.current) {
            // Swallow the remaining momentum; a paused/new gesture returns home.
            latchBoundary();
            return;
          }
          go(0);
          return;
        }
        // Stop at the templates boundary first; a further upward gesture returns.
        if (distance > 2 && distance <= 56) {
          event.preventDefault();
          clampToTemplatesTop();
          return;
        }
      } else {
        clearBoundary();
      }
    };

    const onTouchStart = (event: TouchEvent) => {
      clearBoundary();
      if (snapLocked.current || event.touches.length !== 1) {
        touchStart.current = null;
        return;
      }
      touchStart.current = { y: event.touches[0].clientY, handled: false };
    };

    const onTouchMove = (event: TouchEvent) => {
      const start = touchStart.current;
      if (!start || event.touches.length !== 1) return;
      if (snapLocked.current || start.handled) {
        event.preventDefault();
        return;
      }
      const distance = start.y - event.touches[0].clientY; // > 0: scrolling down

      if (atHero() && distance > 8) {
        event.preventDefault();
        start.handled = true;
        go(templatesTop());
        return;
      }

      if (distance < -8) {
        const toTop = distanceToTemplates();
        if (toTop >= 0 && toTop <= 2) {
          event.preventDefault();
          if (boundaryLatched.current) {
            latchBoundary();
            return;
          }
          start.handled = true;
          go(0);
          return;
        }
        if (toTop > 2 && toTop <= 56) {
          event.preventDefault();
          start.handled = true;
          clampToTemplatesTop();
        }
      }
    };

    const onTouchEnd = () => {
      touchStart.current = null;
    };

    window.addEventListener("wheel", onWheel, { passive: false });
    window.addEventListener("touchstart", onTouchStart, { passive: true });
    window.addEventListener("touchmove", onTouchMove, { passive: false });
    window.addEventListener("touchend", onTouchEnd, { passive: true });
    return () => {
      window.removeEventListener("wheel", onWheel);
      window.removeEventListener("touchstart", onTouchStart);
      window.removeEventListener("touchmove", onTouchMove);
      window.removeEventListener("touchend", onTouchEnd);
    };
  }, []);

  // The second screen is the library itself: load the catalog only when the
  // templates section approaches the viewport.
  useEffect(() => {
    const load = () => {
      if (catalogRequested.current) return;
      catalogRequested.current = true;
      setCatalogError(null);
      void fetch("/template-catalog.json")
        .then((response) => {
          if (!response.ok) throw new Error("模板库加载失败");
          return response.json() as Promise<CatalogFile>;
        })
        .then((data) => setCatalog(data))
        .catch((caught: Error) => setCatalogError(caught.message));
    };

    const element = templatesRef.current;
    if (!element || typeof IntersectionObserver === "undefined") {
      load();
      return;
    }
    const observer = new IntersectionObserver(
      (list) => {
        if (list.some((item) => item.isIntersecting)) {
          observer.disconnect();
          load();
        }
      },
      { rootMargin: "0px" },
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    setPage(0);
  }, [filter, tagFilter]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const [list, active] = await Promise.all([
          listResumes(),
          getActiveResumeId(),
        ]);
        if (cancelled) return;
        setResumes(list);
        setActiveId(active ?? list[0]?.id ?? null);
      } catch {
        /* ignore */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const activeResume =
    resumes.find((resume) => resume.id === activeId) ?? resumes[0] ?? null;

  const startWithCatalogTemplate = async (entry: CatalogTemplate) => {
    if (creating) return;
    setCreating(entry.id);
    try {
      const preset = presetFromCatalog(entry);
      const content = await loadTemplateContent(entry.sourceToken || entry.token);
      const doc = buildTemplateSample(preset, content);
      doc.id = uid("resume");
      doc.title = "未命名简历";
      doc.updatedAt = Date.now();
      await saveResume(doc);
      router.push(`/editor?id=${encodeURIComponent(doc.id)}`);
    } catch {
      window.alert("创建简历失败，请检查浏览器存储权限。");
      setCreating(null);
    }
  };

  const tagFilteredEntries = useMemo(
    () => entries.filter((entry) => !tagFilter || entry.tags.includes(tagFilter)),
    [entries, tagFilter],
  );
  const filteredEntries = useMemo(
    () =>
      tagFilteredEntries.filter(
        (entry) => filter === "all" || entry.layout === filter,
      ),
    [tagFilteredEntries, filter],
  );
  const pageCount = Math.max(1, Math.ceil(filteredEntries.length / CATALOG_PAGE_SIZE));
  const currentPage = Math.min(page, pageCount - 1);
  const pageItems = filteredEntries.slice(
    currentPage * CATALOG_PAGE_SIZE,
    currentPage * CATALOG_PAGE_SIZE + CATALOG_PAGE_SIZE,
  );

  return (
    <div className="min-h-screen bg-white text-slate-900">
      <SiteHeader />

      <section
        className="relative flex min-h-[calc(100vh-4rem)] items-center overflow-hidden border-b border-slate-200 bg-gradient-to-b from-slate-50 via-white to-white"
        style={{ minHeight: "calc(100dvh - 4rem)" }}
      >
        <div className="mx-auto grid w-full max-w-[1600px] items-center gap-12 px-6 py-16 lg:grid-cols-[1.05fr_0.95fr] lg:py-20">
          <div>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3 py-1 text-[11px] text-slate-500">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
              {libraryCount} 套模板 · {TEMPLATE_GROUPS.length} 种版式 · 本地存储
            </span>
            <h1 className="mt-5 text-[42px] font-bold leading-[1.12] tracking-tight text-slate-900 sm:text-[54px]">
              <span className="mb-2 block text-[13px] font-semibold tracking-[0.18em] text-blue-600 sm:text-[14px]">
                在线简历制作 · 4127 套简历模板
              </span>
              一页写清
              <br className="hidden sm:block" />
              你的价值
            </h1>
            <p className="mt-5 max-w-xl text-[15px] leading-8 text-slate-500">
              选一套模板，填完内容，导出 PDF。实时 A4 预览、内容检查、自动保存；
              免费版带水印，会员无水印，简历只留在你的浏览器。
            </p>

            <div className="mt-8 flex flex-wrap items-center gap-3">
              <a
                href="#templates"
                className="inline-flex h-11 items-center gap-2 rounded-md bg-slate-900 px-5 text-[14px] font-medium text-white transition hover:bg-slate-800"
              >
                浏览模板
                <Icon name="arrowDown" size={15} />
              </a>
              {resumes.length > 0 ? (
                <Link
                  href="/editor"
                  className="inline-flex h-11 items-center gap-2 rounded-md border border-slate-200 bg-white px-5 text-[14px] font-medium text-slate-700 transition hover:bg-slate-50"
                >
                  继续编辑
                  <Icon name="arrowRight" size={15} />
                </Link>
              ) : null}
            </div>
            {activeResume ? (
              <p className="mt-3 text-[11px] text-slate-400">
                上次编辑：{activeResume.title}
              </p>
            ) : null}

            <div className="mt-10 grid max-w-md grid-cols-3 gap-4 border-t border-slate-200 pt-5">
              {[
                [`${libraryCount} 套`, "简历模板"],
                [`${TEMPLATE_GROUPS.length} 种`, "版式结构"],
                ["3 种", "导出格式"],
              ].map(([value, label]) => (
                <div key={label}>
                  <div className="text-[18px] font-semibold tracking-tight text-slate-900">
                    {value}
                  </div>
                  <div className="mt-0.5 text-[11px] text-slate-400">{label}</div>
                </div>
              ))}
            </div>
          </div>

          <div className="relative mx-auto hidden h-[500px] w-[500px] max-w-full lg:block">
            <div className="absolute left-0 top-14 rotate-[-6deg] rounded-lg border border-slate-200 bg-white p-1.5 shadow-xl">
              <HeroTemplateThumb
                token={HERO_TEMPLATES[0].token}
                alt={HERO_TEMPLATES[0].alt}
                width={266}
                height={376}
              />
            </div>
            <div className="absolute left-28 top-0 rotate-[2deg] rounded-lg border border-slate-200 bg-white p-1.5 shadow-2xl">
              <HeroTemplateThumb
                token={HERO_TEMPLATES[1].token}
                alt={HERO_TEMPLATES[1].alt}
                width={324}
                height={458}
              />
            </div>
            <div className="absolute right-0 top-24 rotate-[7deg] rounded-lg border border-slate-200 bg-white p-1.5 shadow-xl">
              <HeroTemplateThumb
                token={HERO_TEMPLATES[2].token}
                alt={HERO_TEMPLATES[2].alt}
                width={266}
                height={376}
              />
            </div>
          </div>
        </div>
      </section>

      <section id="templates" ref={templatesRef} className="mx-auto max-w-[1600px] px-6 pb-14 pt-28">
        <div className="flex flex-col justify-between gap-4 md:flex-row md:items-end">
          <div>
            <h2 className="text-[24px] font-bold tracking-tight text-slate-900">
              选择一套模板开始
            </h2>
            <p className="mt-2 text-[13px] text-slate-500">
              点击模板会创建一份新简历；已有简历请从「我的简历」继续编辑。
            </p>
          </div>
          <div className="flex flex-col items-start gap-1.5 md:items-end">
            <Link
              href="/templates"
              className="text-[12px] font-medium text-blue-600 transition hover:text-blue-700 hover:underline"
            >
              浏览全部模板库 →
            </Link>
            <div className="text-[11px] text-slate-400">数据保存在本机 · 编辑无需注册</div>
          </div>
        </div>

        <div className="mt-6 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setFilter("all")}
            className={cn(
              "rounded-full border px-3.5 py-1.5 text-[11px] transition",
              filter === "all"
                ? "border-slate-900 bg-slate-900 text-white"
                : "border-slate-200 bg-white text-slate-500 hover:border-slate-300",
            )}
          >
            全部 {catalog ? tagFilteredEntries.length : libraryCount}
          </button>
          {TEMPLATE_GROUPS.map((group) => {
            const count = tagFilteredEntries.filter(
              (entry) => entry.layout === group.layout,
            ).length;
            if (count === 0) return null;
            return (
              <button
                key={group.layout}
                type="button"
                onClick={() => setFilter(group.layout)}
                className={cn(
                  "rounded-full border px-3.5 py-1.5 text-[11px] transition",
                  filter === group.layout
                    ? "border-slate-900 bg-slate-900 text-white"
                    : "border-slate-200 bg-white text-slate-500 hover:border-slate-300",
                )}
              >
                {group.label} {count}
              </button>
            );
          })}
        </div>

        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          <span className="mr-1 text-[10px] text-slate-400">用途</span>
          <button
            type="button"
            onClick={() => setTagFilter(null)}
            className={cn(
              "rounded-full border px-3 py-1 text-[10px] transition",
              tagFilter === null
                ? "border-slate-700 bg-slate-700 text-white"
                : "border-slate-200 bg-white text-slate-500 hover:border-slate-300",
            )}
          >
            全部用途
          </button>
          {tagOptions.map((tag) => (
            <button
              key={tag}
              type="button"
              onClick={() => setTagFilter(tag === tagFilter ? null : tag)}
              className={cn(
                "rounded-full border px-3 py-1 text-[10px] transition",
                tagFilter === tag
                  ? "border-slate-700 bg-slate-700 text-white"
                  : "border-slate-200 bg-white text-slate-500 hover:border-slate-300",
              )}
            >
              {tag}
            </button>
          ))}
        </div>

        <div className="mt-7">
          {catalogError ? (
            <div className="rounded-xl border border-rose-200 bg-rose-50 px-6 py-8 text-center text-[12px] text-rose-600">
              {catalogError}，请刷新页面重试，或前往
              <Link href="/templates" className="ml-1 underline">
                全部模板库
              </Link>
              。
            </div>
          ) : !catalog ? (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {Array.from({ length: 8 }).map((_, index) => (
                <div
                  key={index}
                  className="aspect-[210/297] animate-pulse rounded-xl border border-slate-200 bg-white"
                />
              ))}
            </div>
          ) : pageItems.length === 0 ? (
            <div className="rounded-xl border border-dashed border-slate-300 bg-white px-6 py-12 text-center text-[12px] text-slate-400">
              没有匹配的模板，试试清除用途或版式筛选。
            </div>
          ) : (
            <>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                {pageItems.map((entry) => (
                  <CatalogTemplateCard
                    key={entry.id}
                    entry={entry}
                    creating={creating !== null}
                    onUse={startWithCatalogTemplate}
                  />
                ))}
              </div>
              <div className="mt-6 flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-400">
                <span>
                  共 {filteredEntries.length} 套 · 第 {currentPage + 1} / {pageCount} 页
                </span>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    disabled={currentPage <= 0}
                    onClick={() => setPage(currentPage - 1)}
                    className="h-7 rounded-md border border-slate-200 bg-white px-2.5 text-[11px] text-slate-600 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    上一页
                  </button>
                  <button
                    type="button"
                    disabled={currentPage >= pageCount - 1}
                    onClick={() => setPage(currentPage + 1)}
                    className="h-7 rounded-md border border-slate-200 bg-white px-2.5 text-[11px] text-slate-600 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    下一页
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      </section>

      <section id="features" className="border-t border-slate-200 bg-slate-50">
        <div className="mx-auto max-w-[1600px] px-6 py-14">
          <h2 className="text-[24px] font-bold tracking-tight text-slate-900">不只是模板</h2>
          <p className="mt-2 max-w-2xl text-[13px] leading-6 text-slate-500">
            编辑器围绕“一页能够投递”设计：实时排版、内容检查、本地保存、三种导出。
          </p>
          <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {[
              {
                icon: "eye" as const,
                title: "实时 A4 预览",
                desc: "左边填写，右边即时看到最终排版与单页状态。",
              },
              {
                icon: "layers" as const,
                title: "本地自动保存",
                desc: "内容存入浏览器 IndexedDB，刷新不丢，不上传服务器。",
              },
              {
                icon: "check" as const,
                title: "内容检查",
                desc: "量化结果、要点数量、联系方式与单页溢出逐项提示。",
              },
              {
                icon: "download" as const,
                title: "PDF / PNG / Word",
                desc: "打印级 PDF、2x 图片与可编辑 Word；免费版带水印，会员导出无水印。",
              },
            ].map((feature) => (
              <div
                key={feature.title}
                className="rounded-xl border border-slate-200 bg-white p-4"
              >
                <div className="flex h-8 w-8 items-center justify-center rounded-md bg-slate-900 text-white">
                  <Icon name={feature.icon} size={15} />
                </div>
                <h3 className="mt-3 text-[13px] font-semibold text-slate-800">
                  {feature.title}
                </h3>
                <p className="mt-1.5 text-[11px] leading-5 text-slate-500">
                  {feature.desc}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {seoContent}

      <SiteFooter />
    </div>
  );
}

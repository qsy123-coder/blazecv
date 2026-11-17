"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { Basics, LayoutKind, Section } from "@/lib/types";
import {
  presetFromCatalog,
  type CatalogFile,
  type CatalogTemplate,
} from "@/lib/catalog";
import { createBlankResume } from "@/lib/sample";
import { saveResume } from "@/lib/storage";
import { fitThemeToOnePage } from "@/lib/fit";
import { TEMPLATE_GROUPS } from "@/lib/gallery";
import { SiteHeader } from "@/components/SiteHeader";
import { Icon } from "@/components/icons";
import { cn } from "@/lib/utils";

const PAGE_SIZE = 48;

const LAYOUT_LABEL: Record<LayoutKind, string> = {
  single: "单栏",
  sidebar: "侧栏",
  timeline: "时间轴",
  banner: "横幅",
  "dark-sidebar": "深色",
  split: "分栏",
  editorial: "标签",
};

export function TemplateCatalog() {
  const router = useRouter();
  const [catalog, setCatalog] = useState<CatalogFile | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [layout, setLayout] = useState<"all" | LayoutKind>("all");
  const [tag, setTag] = useState<string | null>(null);
  const [page, setPage] = useState(0);
  const [using, setUsing] = useState<string | null>(null);
  const [preview, setPreview] = useState<CatalogTemplate | null>(null);

  useEffect(() => {
    let cancelled = false;
    void fetch("/template-catalog.json")
      .then((response) => {
        if (!response.ok) throw new Error("模板库加载失败");
        return response.json() as Promise<CatalogFile>;
      })
      .then((data) => {
        if (!cancelled) setCatalog(data);
      })
      .catch((caught: Error) => {
        if (!cancelled) setError(caught.message);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const entries = catalog?.templates ?? [];

  const tagOptions = useMemo(() => {
    const counts = new Map<string, number>();
    for (const entry of entries) {
      for (const item of entry.tags) {
        counts.set(item, (counts.get(item) ?? 0) + 1);
      }
    }
    return [...counts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 14)
      .map(([name]) => name);
  }, [entries]);

  const filtered = useMemo(() => {
    const keyword = query.trim().toLowerCase();
    return entries.filter((entry) => {
      if (layout !== "all" && entry.layout !== layout) return false;
      if (tag && !entry.tags.includes(tag)) return false;
      if (!keyword) return true;
      return (
        entry.name.toLowerCase().includes(keyword) ||
        entry.sourceName.toLowerCase().includes(keyword) ||
        entry.tags.some((item) => item.toLowerCase().includes(keyword))
      );
    });
  }, [entries, layout, tag, query]);

  useEffect(() => {
    setPage(0);
  }, [query, layout, tag]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount - 1);
  const pageItems = filtered.slice(
    currentPage * PAGE_SIZE,
    currentPage * PAGE_SIZE + PAGE_SIZE,
  );

  const useTemplate = async (entry: CatalogTemplate) => {
    if (using) return;
    setUsing(entry.id);
    try {
      const preset = presetFromCatalog(entry);
      const doc = createBlankResume(preset.id);
      doc.templatePreset = preset;

      if (entry.content) {
        try {
          const response = await fetch(entry.content);
          if (response.ok) {
            const content = (await response.json()) as {
              title?: string;
              basics?: Partial<Basics>;
              sections?: Section[];
            };
            if (content.title) doc.title = content.title;
            if (content.basics) {
              doc.basics = {
                ...doc.basics,
                ...content.basics,
                links: content.basics.links ?? doc.basics.links,
              };
            }
            if (Array.isArray(content.sections) && content.sections.length > 0) {
              doc.sections = content.sections;
            }
          }
        } catch {
          /* 内容缺失时保留空白模板 */
        }
      }

      if (preset.source?.token) {
        // Exact template: render at its own natural layout. Use a neutral theme
        // so the 字号/行距 sliders start from "no change"; the classic
        // fitThemeToOnePage must not run here (it would pick an arbitrary
        // lineHeight and distort the 1:1 render).
        doc.theme = { ...doc.theme, lineHeight: 1.2, fontScale: "md", margin: 10 };
      } else {
        const fitted = await fitThemeToOnePage(doc, preset);
        doc.theme = fitted.theme;
      }

      await saveResume(doc);
      router.push(`/editor?id=${encodeURIComponent(doc.id)}`);
    } catch {
      setUsing(null);
      setError("创建简历失败，请检查浏览器存储空间。");
    }
  };

  return (
    <div className="flex min-h-screen flex-col bg-slate-50">
      <SiteHeader />

      <main className="mx-auto w-full max-w-[1600px] flex-1 px-6 py-10">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-[26px] font-bold tracking-tight text-slate-900">
              模板库
            </h1>
            <p className="mt-1.5 text-[12px] text-slate-500">
              {catalog
                ? `共 ${catalog.count} 套 · ${catalog.withPreview} 套原预览图 · ${catalog.withContent ?? 0} 套含示例内容`
                : "正在加载模板库…"}
            </p>
            <p className="mt-1 text-[10px] text-slate-400">
              缩略图为原始预览图；进入编辑器后优先加载原站 DOM/CSS 1:1 渲染，字段实时绑定。
            </p>
          </div>
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="搜索模板名称 / 用途"
            className="field-input w-full text-[12px] sm:w-64"
            aria-label="搜索模板"
          />
        </div>

        <div className="mt-6 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setLayout("all")}
            className={cn(
              "rounded-full border px-3.5 py-1.5 text-[11px] transition",
              layout === "all"
                ? "border-slate-900 bg-slate-900 text-white"
                : "border-slate-200 bg-white text-slate-500 hover:border-slate-300",
            )}
          >
            全部 {entries.length}
          </button>
          {TEMPLATE_GROUPS.map((group) => {
            const count = entries.filter((entry) => entry.layout === group.layout).length;
            if (count === 0) return null;
            return (
              <button
                key={group.layout}
                type="button"
                onClick={() => setLayout(group.layout)}
                className={cn(
                  "rounded-full border px-3.5 py-1.5 text-[11px] transition",
                  layout === group.layout
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
            onClick={() => setTag(null)}
            className={cn(
              "rounded-full border px-3 py-1 text-[10px] transition",
              tag === null
                ? "border-slate-700 bg-slate-700 text-white"
                : "border-slate-200 bg-white text-slate-500 hover:border-slate-300",
            )}
          >
            全部用途
          </button>
          {tagOptions.map((item) => (
            <button
              key={item}
              type="button"
              onClick={() => setTag(item === tag ? null : item)}
              className={cn(
                "rounded-full border px-3 py-1 text-[10px] transition",
                tag === item
                  ? "border-slate-700 bg-slate-700 text-white"
                  : "border-slate-200 bg-white text-slate-500 hover:border-slate-300",
              )}
            >
              {item}
            </button>
          ))}
        </div>

        {error ? (
          <p className="mt-6 rounded-md bg-rose-50 px-3 py-2 text-[12px] text-rose-600">
            {error}
          </p>
        ) : null}

        {!catalog ? (
          <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {Array.from({ length: 8 }).map((_, index) => (
              <div
                key={index}
                className="h-[360px] animate-pulse rounded-xl border border-slate-200 bg-white"
              />
            ))}
          </div>
        ) : pageItems.length === 0 ? (
          <div className="mt-8 rounded-xl border border-dashed border-slate-300 bg-white px-6 py-12 text-center text-[12px] text-slate-400">
            没有匹配的模板，试试清除筛选。
          </div>
        ) : (
          <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {pageItems.map((entry) => (
              <div
                key={entry.id}
                data-catalog-card
                className="group overflow-hidden rounded-xl border border-slate-200 bg-white transition hover:border-slate-300 hover:shadow-lg"
              >
                <div className="relative aspect-[210/297] overflow-hidden bg-slate-50">
                  {entry.preview ? (
                    <button
                      type="button"
                      onClick={() => setPreview(entry)}
                      className="block h-full w-full cursor-zoom-in"
                      aria-label={`查看 ${entry.name} 大图`}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={entry.preview}
                        alt={entry.name}
                        loading="lazy"
                        className="h-full w-full object-contain"
                      />
                    </button>
                  ) : (
                    <div className="flex h-full flex-col items-center justify-center gap-2 text-slate-300">
                      <Icon name="fileText" size={28} />
                      <span className="text-[10px]">
                        {LAYOUT_LABEL[entry.layout]} · 无预览图
                      </span>
                    </div>
                  )}
                  <span className="absolute right-2 top-2 rounded bg-slate-900/85 px-1.5 py-0.5 text-[9px] text-white">
                    {LAYOUT_LABEL[entry.layout]}
                  </span>
                  <button
                    type="button"
                    onClick={() => void useTemplate(entry)}
                    disabled={using !== null}
                    className="absolute inset-x-2 bottom-2 z-10 flex translate-y-1 items-center justify-center gap-1 rounded-md bg-slate-900/90 py-2 text-[11px] font-medium text-white opacity-0 transition group-hover:translate-y-0 group-hover:opacity-100 disabled:cursor-wait"
                  >
                    {using === entry.id ? "创建中…" : "使用此模板"}
                    <Icon name="arrowRight" size={12} />
                  </button>
                </div>
                <div className="p-3">
                  <h2 className="truncate text-[12px] font-semibold text-slate-800">
                    {entry.name}
                  </h2>
                  <p className="mt-0.5 truncate text-[10px] text-slate-400">
                    {entry.desc || `${entry.tags.slice(0, 2).join(" / ")}`}
                  </p>
                  <div className="mt-1.5 flex flex-wrap gap-1">
                    {entry.tags.slice(0, 3).map((item) => (
                      <span
                        key={item}
                        className="rounded bg-slate-100 px-1.5 py-0.5 text-[9px] text-slate-500"
                      >
                        {item}
                      </span>
                    ))}
                    {entry.content ? (
                      <span className="rounded bg-emerald-50 px-1.5 py-0.5 text-[9px] text-emerald-600">
                        含示例
                      </span>
                    ) : null}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {catalog && filtered.length > 0 ? (
          <div className="mt-8 flex items-center justify-center gap-3 text-[11px] text-slate-500">
            <button
              type="button"
              disabled={currentPage === 0}
              onClick={() => setPage((value) => Math.max(0, value - 1))}
              className="rounded-md border border-slate-200 bg-white px-3 py-1.5 disabled:opacity-40"
            >
              上一页
            </button>
            <span>
              第 {currentPage + 1} / {pageCount} 页 · {filtered.length} 套
            </span>
            <button
              type="button"
              disabled={currentPage >= pageCount - 1}
              onClick={() => setPage((value) => Math.min(pageCount - 1, value + 1))}
              className="rounded-md border border-slate-200 bg-white px-3 py-1.5 disabled:opacity-40"
            >
              下一页
            </button>
          </div>
        ) : null}
      </main>

      {preview ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm"
          onClick={() => setPreview(null)}
        >
          <div
            className="flex max-h-[94vh] w-full max-w-4xl flex-col rounded-xl bg-white p-3 shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3 px-1 pb-2">
              <div className="min-w-0">
                <h3 className="truncate text-[14px] font-semibold text-slate-900">
                  {preview.name}
                </h3>
                <p className="mt-0.5 text-[10px] text-slate-400">
                  {preview.tags.slice(0, 4).join(" / ") || preview.desc}
                </p>
              </div>
              <button
                type="button"
                aria-label="关闭"
                onClick={() => setPreview(null)}
                className="rounded-md p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
              >
                <Icon name="x" size={18} />
              </button>
            </div>

            <div className="min-h-0 flex-1 overflow-auto rounded-lg bg-slate-100">
              {preview.preview ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={preview.preview}
                  alt={preview.name}
                  className="mx-auto block h-auto max-h-[78vh] w-auto max-w-full"
                />
              ) : (
                <div className="flex h-64 items-center justify-center text-[12px] text-slate-400">
                  该模板没有预览图
                </div>
              )}
            </div>

            <div className="flex items-center justify-between gap-3 px-1 pt-3">
              <span className="text-[10px] text-slate-400">
                原始预览图 · 可编辑版式为映射近似
              </span>
              <button
                type="button"
                onClick={() => void useTemplate(preview)}
                disabled={using !== null}
                className="inline-flex h-9 items-center rounded-md bg-slate-900 px-4 text-[12px] font-medium text-white transition hover:bg-slate-800 disabled:cursor-wait"
              >
                {using === preview.id ? "创建中…" : "使用此模板"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <footer className="border-t border-slate-200 bg-white px-6 py-5">
        <div className="mx-auto flex max-w-[1600px] flex-col items-center justify-between gap-2 text-[10px] text-slate-400 sm:flex-row">
          <span>BlazeCV · 模板库</span>
          <span>原预览图 + format_info 映射 · 可编辑版式为近似复刻</span>
        </div>
      </footer>
    </div>
  );
}

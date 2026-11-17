"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type {
  LayoutKind,
  ResumeDoc,
  TemplateId,
  TemplatePreset,
} from "@/lib/types";
import { TEMPLATE_PRESETS } from "@/lib/templates";
import {
  NEW_TEMPLATE_IDS,
  POPULAR_TEMPLATE_IDS,
  TEMPLATE_GROUPS,
} from "@/lib/gallery";
import {
  presetFromCatalog,
  type CatalogFile,
  type CatalogTemplate,
} from "@/lib/catalog";
import { LazyTemplateThumb } from "@/components/home/LazyTemplateThumb";
import { Icon } from "@/components/icons";
import { cn } from "@/lib/utils";

type Filter = "all" | LayoutKind;
type Tab = "featured" | "library";

const LIBRARY_PAGE_SIZE = 24;

function TemplateCard({
  doc,
  preset,
  active,
  onSelect,
}: {
  doc: ResumeDoc;
  preset: TemplatePreset;
  active: boolean;
  onSelect: (id: TemplateId) => void;
}) {
  return (
    <button
      type="button"
      data-template-id={preset.id}
      onClick={() => onSelect(preset.id)}
      className={cn(
        "group flex flex-col rounded-lg border p-2 text-left transition",
        active
          ? "border-slate-900 bg-slate-50 ring-1 ring-slate-900"
          : "border-slate-200 bg-white hover:border-slate-300 hover:shadow-md",
      )}
    >
      <div className="relative flex h-[292px] w-full items-start justify-center overflow-hidden rounded border border-slate-100 bg-slate-50">
        {NEW_TEMPLATE_IDS.has(preset.id) ? (
          <span className="absolute right-1.5 top-1.5 z-10 rounded bg-slate-900 px-1.5 py-0.5 text-[9px] font-medium text-white">
            新
          </span>
        ) : POPULAR_TEMPLATE_IDS.has(preset.id) ? (
          <span className="absolute right-1.5 top-1.5 z-10 rounded bg-amber-100 px-1.5 py-0.5 text-[9px] font-medium text-amber-700">
            热门
          </span>
        ) : null}
        <div className="pointer-events-none">
          <LazyTemplateThumb doc={doc} templateId={preset.id} scale={0.25} />
        </div>
      </div>
      <div className="mt-2 flex w-full items-center justify-between gap-2">
        <span className="truncate text-[12px] font-medium text-slate-700">{preset.name}</span>
        {active ? (
          <span className="shrink-0 rounded bg-slate-900 px-1.5 py-0.5 text-[10px] text-white">
            当前
          </span>
        ) : null}
      </div>
      <span className="mt-0.5 w-full truncate text-[10px] text-slate-400">{preset.desc}</span>
    </button>
  );
}

function CatalogCard({
  entry,
  onSelect,
}: {
  entry: CatalogTemplate;
  onSelect: (preset: TemplatePreset) => void;
}) {
  return (
    <button
      type="button"
      data-catalog-card
      onClick={() => onSelect(presetFromCatalog(entry))}
      aria-label={`使用 ${entry.name}`}
      className="group overflow-hidden rounded-lg border border-slate-200 bg-white text-left transition hover:border-slate-300 hover:shadow-md"
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
            <Icon name="fileText" size={24} />
            <span className="text-[10px]">无预览图</span>
          </div>
        )}
      </div>
      <div className="p-2">
        <div className="truncate text-[11px] font-medium text-slate-700">{entry.name}</div>
        <div className="mt-0.5 truncate text-[9px] text-slate-400">{entry.sourceName}</div>
      </div>
    </button>
  );
}

export function TemplateModal({
  open,
  doc,
  onSelect,
  onSelectPreset,
  onClose,
}: {
  open: boolean;
  doc: ResumeDoc;
  onSelect: (id: TemplateId) => void;
  onSelectPreset: (preset: TemplatePreset) => void;
  onClose: () => void;
}) {
  const [filter, setFilter] = useState<Filter>("all");
  const [tab, setTab] = useState<Tab>("featured");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(0);
  const [catalog, setCatalog] = useState<CatalogFile | null>(null);
  const [catalogLoading, setCatalogLoading] = useState(false);
  const [catalogError, setCatalogError] = useState<string | null>(null);
  const catalogRequested = useRef(false);

  useEffect(() => {
    if (!open) return;
    setFilter("all");
    setTab("featured");
    setQuery("");
    setPage(0);
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  // The full library lives in the same modal instead of sending the user to
  // /templates (which would lose the current selection context).
  useEffect(() => {
    if (!open || tab !== "library" || catalog || catalogRequested.current) return;
    catalogRequested.current = true;
    setCatalogLoading(true);
    setCatalogError(null);
    void fetch("/template-catalog.json")
      .then((response) => {
        if (!response.ok) throw new Error("模板库加载失败");
        return response.json() as Promise<CatalogFile>;
      })
      .then((data) => setCatalog(data))
      .catch((caught: Error) => setCatalogError(caught.message))
      .finally(() => setCatalogLoading(false));
  }, [open, tab, catalog]);

  const entries = useMemo(() => catalog?.templates ?? [], [catalog]);

  useEffect(() => {
    setPage(0);
  }, [query, filter, tab]);

  const filteredEntries = useMemo(() => {
    const keyword = query.trim().toLowerCase();
    return entries.filter((entry) => {
      if (filter !== "all" && entry.layout !== filter) return false;
      if (!keyword) return true;
      return (
        entry.name.toLowerCase().includes(keyword) ||
        entry.sourceName.toLowerCase().includes(keyword) ||
        entry.tags.some((tag) => tag.toLowerCase().includes(keyword))
      );
    });
  }, [entries, filter, query]);

  if (!open) return null;

  const featured = TEMPLATE_PRESETS.filter(
    (preset) => filter === "all" || preset.layout === filter,
  );
  const pageCount = Math.max(1, Math.ceil(filteredEntries.length / LIBRARY_PAGE_SIZE));
  const currentPage = Math.min(page, pageCount - 1);
  const pageItems = filteredEntries.slice(
    currentPage * LIBRARY_PAGE_SIZE,
    currentPage * LIBRARY_PAGE_SIZE + LIBRARY_PAGE_SIZE,
  );

  const renderCard = (preset: TemplatePreset) => (
    <TemplateCard
      key={preset.id}
      doc={doc}
      preset={preset}
      active={preset.id === doc.templateId}
      onSelect={onSelect}
    />
  );

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/45 p-6 backdrop-blur-[2px]"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="max-h-[90vh] w-full max-w-6xl overflow-y-auto rounded-xl bg-white shadow-2xl">
        <div className="sticky top-0 z-20 border-b border-slate-100 bg-white/95 px-5 pb-3 pt-5 backdrop-blur">
          <div className="flex items-start justify-between">
            <div>
              <h2 className="text-[15px] font-semibold text-slate-900">选择模板</h2>
              <p className="mt-0.5 text-[11px] text-slate-400">
                {tab === "featured"
                  ? `${TEMPLATE_PRESETS.length} 套精选模板、${TEMPLATE_GROUPS.length} 种版式。切换模板不会丢失内容；颜色与字号可在左侧继续调整。`
                  : `全部模板库${catalog ? ` ${catalog.count} 套` : ""}。选中后直接用当前简历内容渲染，不跳转页面。`}
              </p>
            </div>
            <button
              type="button"
              aria-label="关闭"
              onClick={onClose}
              className="rounded-md p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
            >
              <Icon name="x" size={18} />
            </button>
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-1.5">
            <button
              type="button"
              onClick={() => setTab("featured")}
              className={cn(
                "rounded-full border px-3.5 py-1.5 text-[11px] font-medium transition",
                tab === "featured"
                  ? "border-slate-900 bg-slate-900 text-white"
                  : "border-slate-200 bg-white text-slate-500 hover:border-slate-300",
              )}
            >
              精选模板 {TEMPLATE_PRESETS.length}
            </button>
            <button
              type="button"
              onClick={() => setTab("library")}
              className={cn(
                "rounded-full border px-3.5 py-1.5 text-[11px] font-medium transition",
                tab === "library"
                  ? "border-slate-900 bg-slate-900 text-white"
                  : "border-slate-200 bg-white text-slate-500 hover:border-slate-300",
              )}
            >
              全部模板库{catalog ? ` ${catalog.count}` : ""}
            </button>
            {tab === "library" ? (
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="搜索模板名称 / 用途"
                aria-label="搜索全部模板库"
                className="field-input ml-auto w-full text-[11px] sm:w-64"
              />
            ) : null}
          </div>

          <div className="mt-3 flex flex-wrap gap-1.5">
            <button
              type="button"
              onClick={() => setFilter("all")}
              className={cn(
                "rounded-full border px-3 py-1 text-[11px] transition",
                filter === "all"
                  ? "border-slate-900 bg-slate-900 text-white"
                  : "border-slate-200 bg-white text-slate-500 hover:border-slate-300",
              )}
            >
              全部 {tab === "featured" ? TEMPLATE_PRESETS.length : entries.length}
            </button>
            {TEMPLATE_GROUPS.map((group) => {
              const count =
                tab === "featured"
                  ? TEMPLATE_PRESETS.filter((preset) => preset.layout === group.layout).length
                  : entries.filter((entry) => entry.layout === group.layout).length;
              if (count === 0) return null;
              return (
                <button
                  key={group.layout}
                  type="button"
                  onClick={() => setFilter(group.layout)}
                  className={cn(
                    "rounded-full border px-3 py-1 text-[11px] transition",
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
        </div>

        <div className="px-5 py-4">
          {tab === "featured" ? (
            filter === "all" ? (
              <div className="space-y-5">
                {TEMPLATE_GROUPS.map((group) => {
                  const presets = TEMPLATE_PRESETS.filter(
                    (preset) => preset.layout === group.layout,
                  );
                  if (presets.length === 0) return null;
                  return (
                    <section key={group.layout}>
                      <div className="mb-2 flex items-center gap-2">
                        <h3 className="text-[12px] font-semibold text-slate-700">
                          {group.label}
                        </h3>
                        <span className="text-[10px] text-slate-400">
                          {presets.length} 套
                        </span>
                      </div>
                      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                        {presets.map(renderCard)}
                      </div>
                    </section>
                  );
                })}
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                {featured.map(renderCard)}
              </div>
            )
          ) : catalogError ? (
            <p className="rounded-md bg-rose-50 px-3 py-2 text-[12px] text-rose-600">
              {catalogError}
            </p>
          ) : !catalog ? (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-6">
              {Array.from({ length: 12 }).map((_, index) => (
                <div
                  key={index}
                  className="aspect-[210/297] animate-pulse rounded-lg border border-slate-200 bg-slate-100"
                />
              ))}
            </div>
          ) : pageItems.length === 0 ? (
            <p className="rounded-md border border-dashed border-slate-300 px-4 py-10 text-center text-[12px] text-slate-400">
              没有匹配的模板，试试清除筛选。
            </p>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-6">
                {pageItems.map((entry) => (
                  <CatalogCard key={entry.id} entry={entry} onSelect={onSelectPreset} />
                ))}
              </div>
              <div className="mt-4 flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-400">
                <span>
                  共 {filteredEntries.length} 套 · 第 {currentPage + 1} / {pageCount} 页
                </span>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    disabled={currentPage <= 0}
                    onClick={() => setPage(currentPage - 1)}
                    className="h-7 rounded-md border border-slate-200 px-2.5 text-[11px] text-slate-600 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    上一页
                  </button>
                  <button
                    type="button"
                    disabled={currentPage >= pageCount - 1}
                    onClick={() => setPage(currentPage + 1)}
                    className="h-7 rounded-md border border-slate-200 px-2.5 text-[11px] text-slate-600 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    下一页
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

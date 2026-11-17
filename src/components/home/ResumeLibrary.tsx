"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { ResumeDoc } from "@/lib/types";
import {
  deleteResume,
  duplicateResume,
  getActiveResumeId,
  listResumeRecords,
  type ResumeSummary,
} from "@/lib/storage";
import { getTemplate } from "@/lib/templates";
import { LazyTemplateThumb } from "@/components/home/LazyTemplateThumb";
import { SiteHeader } from "@/components/SiteHeader";
import { Icon } from "@/components/icons";
import { cn } from "@/lib/utils";

function formatDate(timestamp: number): string {
  return new Date(timestamp).toLocaleString("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function ResumeLibrary() {
  const [resumes, setResumes] = useState<ResumeSummary[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [docs, setDocs] = useState<Record<string, ResumeDoc>>({});
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");

  const load = async () => {
    try {
      // One IndexedDB read for the whole library: the records already contain
      // the full doc, so re-reading each resume by id (the old N+1 pattern)
      // made large libraries feel like they never finished loading.
      const [records, active] = await Promise.all([
        listResumeRecords(),
        getActiveResumeId(),
      ]);
      const list: ResumeSummary[] = records.map((row) => ({
        id: row.id,
        title: row.title,
        updatedAt: row.updatedAt,
        templateId: row.doc.templateId,
        templateName:
          row.doc.templatePreset?.name ?? getTemplate(row.doc.templateId).name,
      }));
      const docMap: Record<string, ResumeDoc> = {};
      for (const row of records) docMap[row.id] = row.doc;
      setResumes(list);
      setActiveId(active ?? list[0]?.id ?? null);
      setDocs(docMap);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const filtered = query.trim()
    ? resumes.filter((resume) =>
        resume.title.toLowerCase().includes(query.trim().toLowerCase()),
      )
    : resumes;

  const handleDuplicate = async (id: string) => {
    await duplicateResume(id);
    await load();
  };

  const handleDelete = async (id: string, title: string) => {
    if (!window.confirm(`删除「${title}」？本地记录与历史版本会一起删除。`)) {
      return;
    }
    await deleteResume(id);
    await load();
  };

  return (
    <div className="flex min-h-screen flex-col bg-slate-50">
      <SiteHeader />

      <main className="mx-auto w-full max-w-[1600px] flex-1 px-6 py-10">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-[26px] font-bold tracking-tight text-slate-900">
              我的简历
            </h1>
            <p className="mt-1.5 text-[12px] text-slate-500">
              共 {resumes.length} 份 · 数据保存在本机 · 当前简历标记为「当前」
            </p>
          </div>
          {resumes.length > 0 ? (
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="搜索简历标题"
              className="field-input w-full text-[12px] sm:w-56"
              aria-label="搜索简历"
            />
          ) : null}
        </div>

        {loading ? (
          <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {[1, 2, 3, 4].map((item) => (
              <div
                key={item}
                className="h-[360px] animate-pulse rounded-xl border border-slate-200 bg-white"
              />
            ))}
          </div>
        ) : resumes.length === 0 ? (
          <div className="mt-8 rounded-xl border border-dashed border-slate-300 bg-white px-6 py-16 text-center">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 text-slate-400">
              <Icon name="fileText" size={22} />
            </div>
            <h2 className="mt-4 text-[16px] font-semibold text-slate-800">
              还没有简历
            </h2>
            <p className="mt-1.5 text-[12px] text-slate-500">
              从一套模板开始，第一份简历几分钟就能完成。
            </p>
            <Link
              href="/#templates"
              className="mt-5 inline-flex h-9 items-center rounded-md bg-slate-900 px-4 text-[13px] font-medium text-white transition hover:bg-slate-800"
            >
              去选模板
            </Link>
          </div>
        ) : filtered.length === 0 ? (
          <div className="mt-8 rounded-xl border border-slate-200 bg-white px-6 py-12 text-center text-[12px] text-slate-400">
            没有匹配「{query.trim()}」的简历
          </div>
        ) : (
          <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {filtered.map((resume) => {
              const active = resume.id === activeId;
              const doc = docs[resume.id];
              return (
                <div
                  key={resume.id}
                  data-resume-card
                  className={cn(
                    "group overflow-hidden rounded-xl border bg-white transition",
                    active
                      ? "border-slate-900 shadow-sm"
                      : "border-slate-200 hover:border-slate-300 hover:shadow-lg",
                  )}
                >
                  <Link
                    href={`/editor?id=${encodeURIComponent(resume.id)}`}
                    className="relative block bg-slate-50 p-2"
                  >
                    <div className="flex h-[280px] items-start justify-center overflow-hidden rounded-lg">
                      {doc ? (
                        <LazyTemplateThumb
                          doc={doc}
                          templateId={resume.templateId}
                          scale={0.24}
                        />
                      ) : (
                        <div className="flex h-full items-center justify-center text-[11px] text-slate-300">
                          加载预览…
                        </div>
                      )}
                    </div>
                    {active ? (
                      <span className="absolute right-3 top-3 z-20 rounded bg-slate-900 px-1.5 py-0.5 text-[9px] text-white">
                        当前
                      </span>
                    ) : null}
                    <div className="absolute inset-x-2 bottom-2 z-20 flex translate-y-1 items-center justify-center gap-1 rounded-md bg-slate-900/90 py-2 text-[11px] font-medium text-white opacity-0 transition group-hover:translate-y-0 group-hover:opacity-100">
                      打开编辑器
                      <Icon name="arrowRight" size={12} />
                    </div>
                  </Link>

                  <div className="p-4 pt-3">
                    <h2 className="truncate text-[13px] font-semibold text-slate-800">
                      {resume.title}
                    </h2>
                    <p className="mt-1 text-[10px] text-slate-400">
                      {resume.templateName} · {formatDate(resume.updatedAt)}
                    </p>
                    <div className="mt-3 flex items-center gap-1.5">
                      <Link
                        href={`/editor?id=${encodeURIComponent(resume.id)}`}
                        className="inline-flex h-8 items-center rounded-md bg-slate-900 px-3 text-[11px] font-medium text-white transition hover:bg-slate-800"
                      >
                        打开
                      </Link>
                      <button
                        type="button"
                        onClick={() => void handleDuplicate(resume.id)}
                        className="inline-flex h-8 items-center rounded-md border border-slate-200 px-2.5 text-[11px] text-slate-600 transition hover:bg-slate-50"
                      >
                        复制
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleDelete(resume.id, resume.title)}
                        className="inline-flex h-8 items-center rounded-md px-2.5 text-[11px] text-slate-400 transition hover:bg-rose-50 hover:text-rose-500"
                      >
                        删除
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        <p className="mt-8 text-[10px] leading-relaxed text-slate-400">
          简历与历史版本只保存在当前浏览器。换设备前请从编辑器「备份 → 导出 JSON」，
          或登录云端同步。
        </p>
      </main>

      <footer className="border-t border-slate-200 bg-white px-6 py-5">
        <div className="mx-auto flex max-w-[1600px] flex-col items-center justify-between gap-2 text-[10px] text-slate-400 sm:flex-row">
          <span>BlazeCV · 本地优先的简历工具</span>
          <span>48 套模板 · 多页排版 · PDF / PNG / Word</span>
        </div>
      </footer>
    </div>
  );
}

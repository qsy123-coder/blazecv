"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { ResumeDoc, TemplateId } from "@/lib/types";
import { useResumeStore } from "@/store/useResumeStore";
import {
  loadActiveResume,
  loadResumeById,
  saveResume,
  setActiveResume,
} from "@/lib/storage";
import { createBlankResume, createSampleResume } from "@/lib/sample";
import { getDocTemplate, resolveTokens, TEMPLATE_IDS } from "@/lib/templates";
import { parseResumeObject, parseResumeJson } from "@/lib/schema";
import { exportPng } from "@/lib/export/png";
import { exportWord } from "@/lib/export/word";
import { getExactTemplateToken } from "@/lib/exact-template";
import {
  exportExactPdf,
  exportExactPdfText,
  exportExactPng,
  exportExactWord,
} from "@/lib/exact-export";
import { downloadText, readFileAsText, safeFileName, todayStamp } from "@/lib/utils";
import { Toolbar } from "@/components/Toolbar";
import { EditorSplit } from "@/components/editor/EditorSplit";
import { TemplateModal } from "@/components/TemplateModal";
import { ResumePaper } from "@/components/preview/ResumePaper";
import { usePagination } from "@/components/preview/usePagination";
import { Icon } from "@/components/icons";

export default function AppShell() {
  const doc = useResumeStore((state) => state.doc);
  const hydrated = useResumeStore((state) => state.hydrated);
  const saveState = useResumeStore((state) => state.saveState);
  const storageError = useResumeStore((state) => state.storageError);
  const hydrate = useResumeStore((state) => state.hydrate);
  const reset = useResumeStore((state) => state.reset);
  const undo = useResumeStore((state) => state.undo);
  const redo = useResumeStore((state) => state.redo);
  const setSaveState = useResumeStore((state) => state.setSaveState);
  const setStorageError = useResumeStore((state) => state.setStorageError);

  const [templatesOpen, setTemplatesOpen] = useState(false);
  const [remoteConflict, setRemoteConflict] = useState(false);
  const [exportProgress, setExportProgress] = useState<{
    label: string;
    detail: string;
    startedAt: number;
  } | null>(null);
  const hydratedOnce = useRef(false);

  useEffect(() => {
    if (hydratedOnce.current) return;
    hydratedOnce.current = true;
    void (async () => {
      try {
        const params = new URLSearchParams(window.location.search);
        const raw = params.get("template");
        const requested =
          raw && TEMPLATE_IDS.includes(raw as TemplateId)
            ? (raw as TemplateId)
            : null;
        const requestedId = params.get("id");

        const byId = requestedId ? await loadResumeById(requestedId) : null;
        const existing = byId ?? (await loadActiveResume());
        if (existing) {
          const parsed = parseResumeObject(existing);
          if (parsed.ok) {
            if (requestedId && requestedId === parsed.doc.id) {
              void setActiveResume(parsed.doc.id).catch(() => undefined);
            }
            if (requested && parsed.doc.templateId !== requested) {
              parsed.doc.templateId = requested;
              parsed.doc.updatedAt = Date.now();
              hydrate(parsed.doc);
              void saveResume(parsed.doc).catch(() => undefined);
            } else {
              hydrate(parsed.doc);
            }
          } else {
            const doc = createSampleResume(requested ?? "minimal");
            hydrate(doc);
            void saveResume(doc).catch(() => undefined);
          }
        } else {
          const doc = createSampleResume(requested ?? "minimal");
          hydrate(doc);
          void saveResume(doc).catch(() => undefined);
        }
      } catch {
        hydrate(
          createSampleResume(),
          "当前浏览器无法使用本地存储，内容只保存在内存中，刷新会丢失。请及时用「备份 → 导出 JSON」。",
        );
      }
    })();
  }, [hydrate]);

  useEffect(() => {
    if (!hydrated) return;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let pending: ResumeDoc | null = null;

    const tabId =
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const channel =
      typeof BroadcastChannel !== "undefined"
        ? new BroadcastChannel("blazecv-sync")
        : null;

    const onMessage = (event: MessageEvent) => {
      const data = event.data as { type?: string; tabId?: string } | null;
      if (data?.type === "saved" && data.tabId && data.tabId !== tabId) {
        setRemoteConflict(true);
      }
    };
    channel?.addEventListener("message", onMessage);

    const flush = async () => {
      if (!pending) return;
      const target = pending;
      pending = null;
      try {
        await saveResume(target);
        setSaveState("saved");
        setStorageError(null);
        channel?.postMessage({ type: "saved", tabId, updatedAt: target.updatedAt });
      } catch (error) {
        const message = (error as Error)?.message ?? "";
        const quota =
          (error as Error)?.name === "QuotaExceededError" || /quota/i.test(message);
        setStorageError(
          quota
            ? "浏览器存储空间不足：先用「备份 → 导出 JSON」保存，再清理旧数据。当前修改仍在内存中。"
            : "自动保存失败，请用「备份 → 导出 JSON」保存当前内容。",
        );
        setSaveState("error");
      }
    };

    const unsubscribe = useResumeStore.subscribe((state, prev) => {
      if (state.doc && state.doc !== prev.doc) {
        pending = state.doc;
        if (timer) clearTimeout(timer);
        timer = setTimeout(() => {
          void flush();
        }, 500);
      }
    });

    const onVisibility = () => {
      if (document.visibilityState === "hidden" && pending) {
        if (timer) clearTimeout(timer);
        void flush();
      }
    };
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      unsubscribe();
      document.removeEventListener("visibilitychange", onVisibility);
      channel?.removeEventListener("message", onMessage);
      channel?.close();
      if (timer) clearTimeout(timer);
    };
  }, [hydrated, setSaveState, setStorageError]);

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey)) return;
      const key = event.key.toLowerCase();
      if (key === "z") {
        event.preventDefault();
        if (event.shiftKey) redo();
        else undo();
      } else if (key === "y") {
        event.preventDefault();
        redo();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [undo, redo]);

  const template = doc ? getDocTemplate(doc) : null;
  const tokens = useMemo(
    () => (doc && template ? resolveTokens(template, doc.theme) : null),
    [doc, template],
  );
  const { pages, paginating } = usePagination(doc, tokens);
  const effectivePages = pages.length > 0 ? pages : doc ? [doc] : [];

  if (!hydrated || !doc || !tokens) {
    return (
      <div className="flex h-screen items-center justify-center text-[13px] text-slate-400">
        正在载入简历…
      </div>
    );
  }

  const runExport = async (
    label: string,
    task: (onProgress: (detail: string) => void) => Promise<boolean>,
  ): Promise<boolean> => {
    const startedAt = Date.now();
    setExportProgress({ label, detail: "准备中…", startedAt });
    try {
      return await task((detail) =>
        setExportProgress((current) =>
          current ? { ...current, detail } : { label, detail, startedAt },
        ),
      );
    } finally {
      setExportProgress(null);
    }
  };

  const handleExportPdf = async () => {
    if (getExactTemplateToken(doc)) {
      const ok = await runExport("导出 PDF（图片版）", (onProgress) =>
        exportExactPdf(doc, doc.title, onProgress),
      );
      if (ok) return;
      window.alert("原站模板 PDF 生成失败，请改用 PNG 或稍后重试。");
      return;
    }
    window.print();
  };

  const handleExportPdfText = async () => {
    if (getExactTemplateToken(doc)) {
      const ok = await runExport("导出 PDF（文字版）", (onProgress) =>
        exportExactPdfText(doc, doc.title, onProgress),
      );
      if (ok) return;
      window.alert("文字版 PDF 生成失败，请改用图片版 PDF。");
      return;
    }
    window.print();
  };

  const handleExportPng = async () => {
    if (getExactTemplateToken(doc)) {
      const ok = await runExport("导出 PNG 图片", (onProgress) =>
        exportExactPng(doc, doc.title, "", onProgress),
      );
      if (ok) return;
      window.alert("原站模板图片生成失败，请改用「导出 PDF」或稍后重试。");
      return;
    }
    const nodes = Array.from(
      document.querySelectorAll<HTMLElement>(".app-shell [data-resume-page]"),
    );
    if (nodes.length === 0) return;
    try {
      for (let index = 0; index < nodes.length; index += 1) {
        await exportPng(
          nodes[index],
          doc.title,
          nodes.length > 1 ? `-p${index + 1}` : "",
        );
        await new Promise((resolve) => setTimeout(resolve, 150));
      }
    } catch (error) {
      window.alert(`导出图片失败：${(error as Error).message}`);
    }
  };

  const handleExportWord = async () => {
    try {
      if (getExactTemplateToken(doc)) {
        const ok = await runExport("导出 Word（图片版）", (onProgress) =>
          exportExactWord(doc, doc.title, onProgress),
        );
        if (ok) return;
        window.alert("原站模板 Word 生成失败，请改用 PDF 或 PNG。");
        return;
      }
      await exportWord(doc);
    } catch (error) {
      window.alert(`导出 Word 失败：${(error as Error).message}`);
    }
  };

  const handleExportWordText = async () => {
    try {
      await exportWord(doc);
    } catch (error) {
      window.alert(`导出 Word（文字版）失败：${(error as Error).message}`);
    }
  };

  const handleExportJson = () => {
    downloadText(
      JSON.stringify(doc, null, 2),
      `${safeFileName(doc.title)}-${todayStamp()}.json`,
    );
  };

  const handleImportFile = async (file: File) => {
    try {
      const text = await readFileAsText(file);
      const result = parseResumeJson(text);
      if (!result.ok) {
        window.alert(`导入失败：${result.error}`);
        return;
      }
      if (!window.confirm("导入会覆盖当前简历，继续？")) return;
      reset(result.doc);
      void saveResume(result.doc).catch(() => undefined);
    } catch (error) {
      window.alert(`导入失败：${(error as Error).message}`);
    }
  };

  const handleClear = () => {
    if (!window.confirm("清空当前内容并还原为空白模板？建议先导出 JSON 备份。")) return;
    const blank = {
      ...createBlankResume(doc.templateId),
      id: doc.id,
    };
    reset(blank);
    void saveResume(blank).catch(() => undefined);
  };

  return (
    <>
      <div className="app-shell flex h-screen flex-col overflow-hidden bg-[#eef0f3]">
        <Toolbar
          doc={doc}
          saveState={saveState}
          onOpenTemplates={() => setTemplatesOpen(true)}
          onExportPdf={handleExportPdf}
          onExportPdfText={() => void handleExportPdfText()}
          onExportPng={() => void handleExportPng()}
          onExportWord={() => void handleExportWord()}
          onExportWordText={() => void handleExportWordText()}
          onExportJson={handleExportJson}
          onImportFile={(file) => void handleImportFile(file)}
          onClear={handleClear}
        />

        <div className="flex items-center gap-2 border-b border-amber-200 bg-amber-50 px-4 py-1.5 text-[11px] text-amber-800 md:hidden">
          <Icon name="alert" size={13} className="shrink-0" />
          当前为预览模式，请在电脑端编辑以获得完整功能。
        </div>

        {remoteConflict ? (
          <div className="flex items-center gap-2 border-b border-blue-200 bg-blue-50 px-4 py-1.5 text-[11px] text-blue-800">
            <Icon name="alert" size={13} className="shrink-0" />
            另一标签页已保存更新。
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="font-medium underline underline-offset-2"
            >
              刷新载入
            </button>
            <button
              type="button"
              onClick={() => setRemoteConflict(false)}
              className="ml-auto text-blue-500 transition hover:text-blue-700"
            >
              忽略
            </button>
          </div>
        ) : null}

        {storageError ? (
          <div className="flex items-center gap-2 border-b border-amber-200 bg-amber-50 px-4 py-1.5 text-[11px] text-amber-800">
            <Icon name="alert" size={13} className="shrink-0" />
            {storageError}
          </div>
        ) : null}

        <EditorSplit
          doc={doc}
          tokens={tokens}
          templateName={template?.name ?? ""}
          pages={effectivePages}
          paginating={paginating}
        />

        <footer className="flex h-6 shrink-0 items-center justify-center gap-2 border-t border-slate-200 bg-white text-[10px] text-slate-400">
          <span>数据仅保存在本机</span>
          <span className="text-slate-300">·</span>
          <span>桌面端编辑体验最佳</span>
        </footer>
      </div>

      <div className="print-sheet">
        {effectivePages.map((pageDoc, index) => (
          <div
            key={index}
            className="page-frame print-page"
            style={{ width: "210mm" }}
          >
            <ResumePaper doc={pageDoc} tokens={tokens} />
          </div>
        ))}
      </div>

      <TemplateModal
        open={templatesOpen}
        doc={doc}
        onSelect={(id) => {
          useResumeStore.getState().setTemplate(id);
          setTemplatesOpen(false);
        }}
        onSelectPreset={(preset) => {
          useResumeStore.getState().setTemplatePreset(preset);
          setTemplatesOpen(false);
        }}
        onClose={() => setTemplatesOpen(false)}
      />

      {exportProgress ? <ExportProgressOverlay state={exportProgress} /> : null}
    </>
  );
}

function ExportProgressOverlay({
  state,
}: {
  state: { label: string; detail: string; startedAt: number };
}) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(timer);
  }, []);
  const seconds = Math.max(0, Math.floor((now - state.startedAt) / 1000));
  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center bg-slate-900/30 p-4 backdrop-blur-[1px]"
      role="dialog"
      aria-modal="true"
      aria-live="polite"
    >
      <div className="w-full max-w-[340px] rounded-xl border border-slate-200 bg-white p-5 shadow-2xl">
        <div className="flex items-start gap-3">
          <span className="mt-0.5 h-5 w-5 shrink-0 animate-spin rounded-full border-2 border-slate-200 border-t-slate-700" />
          <div className="min-w-0">
            <div className="text-[13px] font-semibold text-slate-800">
              {state.label}
            </div>
            <div className="mt-1 text-[12px] leading-5 text-slate-600">
              {state.detail}
            </div>
          </div>
        </div>
        <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-slate-100">
          <div className="h-full w-full animate-pulse rounded-full bg-slate-400" />
        </div>
        <div className="mt-2 flex items-center justify-between text-[10px] text-slate-400">
          <span>请勿关闭页面</span>
          <span className="tabular-nums">已用时 {seconds} 秒</span>
        </div>
      </div>
    </div>
  );
}

"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { ReactNode } from "react";
import type { ResumeDoc } from "@/lib/types";
import type { SaveState } from "@/store/useResumeStore";
import { useResumeStore } from "@/store/useResumeStore";
import { Button } from "@/components/ui";
import { Icon } from "@/components/icons";
import type { IconName } from "@/components/icons";
import { CloudMenu } from "@/components/account/CloudMenu";
import { VersionHistory } from "@/components/editor/VersionHistory";
import { getExactTemplateToken } from "@/lib/exact-template";
import { useMembership } from "@/lib/use-membership";

function Menu({
  label,
  icon,
  children,
}: {
  label: string;
  icon: IconName;
  children: ReactNode;
}) {
  return (
    <details className="group relative">
      <summary className="flex h-9 cursor-pointer list-none items-center gap-1.5 rounded-md border border-slate-200 bg-white px-3 text-[13px] font-medium text-slate-700 transition hover:bg-slate-50 [&::-webkit-details-marker]:hidden">
        <Icon name={icon} size={15} className="text-slate-500" />
        {label}
        <Icon name="chevronDown" size={12} className="text-slate-400" />
      </summary>
      <div className="absolute right-0 z-40 mt-1 w-48 rounded-lg border border-slate-200 bg-white p-1 shadow-xl">
        {children}
      </div>
    </details>
  );
}

function MenuItem({
  icon,
  children,
  onClick,
}: {
  icon: IconName;
  children: ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={(event) => {
        onClick();
        const details = event.currentTarget.closest("details") as HTMLDetailsElement | null;
        details?.removeAttribute("open");
      }}
      className="flex w-full items-center gap-2 rounded px-2.5 py-1.5 text-left text-[12px] text-slate-600 transition hover:bg-slate-50"
    >
      <Icon name={icon} size={14} className="text-slate-400" />
      {children}
    </button>
  );
}

export function Toolbar({
  doc,
  saveState,
  onOpenTemplates,
  onExportPdf,
  onExportPdfText,
  onExportPng,
  onExportWord,
  onExportWordText,
  onExportJson,
  onImportFile,
  onClear,
}: {
  doc: ResumeDoc;
  saveState: SaveState;
  onOpenTemplates: () => void;
  onExportPdf: () => void;
  onExportPdfText: () => void;
  onExportPng: () => void;
  onExportWord: () => void;
  onExportWordText: () => void;
  onExportJson: () => void;
  onImportFile: (file: File) => void;
  onClear: () => void;
}) {
  const update = useResumeStore((state) => state.update);
  const undo = useResumeStore((state) => state.undo);
  const redo = useResumeStore((state) => state.redo);
  const pastLength = useResumeStore((state) => state.past.length);
  const futureLength = useResumeStore((state) => state.future.length);
  const importRef = useRef<HTMLInputElement>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const membership = useMembership();
  const router = useRouter();

  // Arrow = 浏览器意义上的「返回上一页」；没有站内/历史可退时才回首页。
  // Logo = 明确的「回首页」，两者不再混用同一个目标。
  const goBack = () => {
    if (typeof window !== "undefined" && window.history.length > 1) {
      router.back();
    } else {
      router.push("/");
    }
  };

  return (
    <>
      {/*
        relative + z-50: the header sits above the later editor/preview siblings.
        Without it, backdrop-blur makes the header a z-auto stacking context and
        the export dropdown (z-40 inside it) is painted under the preview pane.
      */}
      <header className="relative z-50 flex h-16 shrink-0 items-center gap-3 border-b border-slate-200/80 bg-white/90 px-4 backdrop-blur">
      <button
        type="button"
        onClick={goBack}
        aria-label="返回上一页"
        title="返回上一页"
        className="flex h-8 w-8 items-center justify-center rounded-md text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
      >
        <Icon name="arrowLeft" size={16} />
      </button>
      <Link
        href="/"
        aria-label="返回首页"
        title="返回首页"
        className="flex items-center gap-2 rounded-md transition hover:opacity-80"
      >
        <div className="flex h-7 w-7 items-center justify-center rounded-md bg-slate-900 text-[13px] font-bold text-white">
          B
        </div>
        <span className="text-[15px] font-semibold tracking-tight text-slate-900">BlazeCV</span>
      </Link>

      <div className="mx-1 h-5 w-px bg-slate-200" />

      <input
        value={doc.title}
        onChange={(event) =>
          update((draft) => {
            draft.title = event.target.value;
          }, "doc.title")
        }
        className="w-52 rounded-md border border-transparent px-2 py-1 text-[13px] text-slate-700 outline-none transition hover:border-slate-200 focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
        aria-label="简历名称"
      />

      <span className="flex min-w-[72px] items-center gap-1 text-[11px]">
        {saveState === "saving" ? (
          <span className="text-slate-400">保存中…</span>
        ) : saveState === "saved" ? (
          <span className="flex items-center gap-1 text-emerald-600">
            <Icon name="check" size={12} />
            已保存
          </span>
        ) : saveState === "error" ? (
          <span className="flex items-center gap-1 text-red-500">
            <Icon name="alert" size={12} />
            未保存
          </span>
        ) : null}
      </span>

      <div className="ml-auto flex items-center gap-1.5">
        <Button
          size="icon"
          variant="ghost"
          aria-label="撤销"
          title="撤销 (Ctrl+Z)"
          disabled={pastLength === 0}
          onClick={undo}
        >
          <Icon name="undo" size={15} />
        </Button>
        <Button
          size="icon"
          variant="ghost"
          aria-label="重做"
          title="重做 (Ctrl+Shift+Z)"
          disabled={futureLength === 0}
          onClick={redo}
        >
          <Icon name="redo" size={15} />
        </Button>

        <div className="mx-1 h-5 w-px bg-slate-200" />

        <Link
          href="/resumes"
          className="hidden h-8 items-center rounded-md px-2.5 text-[12px] text-slate-500 transition hover:bg-slate-50 hover:text-slate-900 xl:inline-flex"
        >
          我的简历
        </Link>

        <CloudMenu />

        <Button size="md" onClick={onOpenTemplates} title="选择模板">
          <Icon name="grid" size={15} />
          模板
        </Button>

        <Menu label="导出" icon="download">
          <div className="mb-1 rounded px-2.5 py-1.5 text-[10px] leading-relaxed text-slate-400">
            {!membership.payEnabled ? (
              "导出"
            ) : membership.active ? (
              "会员导出 · 无水印"
            ) : (
              <>
                导出为会员功能 ·{" "}
                <Link
                  href="/membership"
                  className="font-medium text-slate-900 underline underline-offset-2"
                >
                  开通会员
                </Link>
              </>
            )}
          </div>
          <div className="my-1 h-px bg-slate-100" />
          <MenuItem icon="printer" onClick={onExportPdf}>
            {getExactTemplateToken(doc) ? "导出 PDF（图片版）" : "导出 PDF（打印）"}
          </MenuItem>
          {getExactTemplateToken(doc) ? (
            <MenuItem icon="fileText" onClick={onExportPdfText}>
              导出 PDF（文字版·可编辑）
            </MenuItem>
          ) : null}
          <MenuItem icon="image" onClick={onExportPng}>
            导出 PNG 图片
          </MenuItem>
          <MenuItem icon="fileText" onClick={onExportWord}>
            {getExactTemplateToken(doc) ? "导出 Word（图片版）" : "导出 Word 文档"}
          </MenuItem>
          {getExactTemplateToken(doc) ? (
            <MenuItem icon="fileText" onClick={onExportWordText}>
              导出 Word（文字版·可编辑）
            </MenuItem>
          ) : null}
        </Menu>

        <Menu label="备份" icon="layers">
          <MenuItem icon="download" onClick={onExportJson}>
            导出 JSON
          </MenuItem>
          <MenuItem icon="upload" onClick={() => importRef.current?.click()}>
            导入 JSON
          </MenuItem>
          <div className="my-1 h-px bg-slate-100" />
          <MenuItem icon="history" onClick={() => setHistoryOpen(true)}>
            历史版本
          </MenuItem>
          <MenuItem icon="trash" onClick={onClear}>
            清空内容
          </MenuItem>
        </Menu>

        <input
          ref={importRef}
          type="file"
          accept=".json,application/json"
          className="hidden"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) onImportFile(file);
            event.target.value = "";
          }}
        />
      </div>
      </header>

      <VersionHistory
        open={historyOpen}
        onClose={() => setHistoryOpen(false)}
      />
    </>
  );
}

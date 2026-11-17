"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { ResumeDoc, TemplateTokens } from "@/lib/types";
import { EditorPanel } from "./EditorPanel";
import { PreviewPane } from "@/components/PreviewPane";
import { cn } from "@/lib/utils";

const STORAGE_KEY = "blazecv.editor-width";
const MIN_LEFT = 420;
const MIN_RIGHT = 360;
const MAX_LEFT = 1600;

function clampWidth(value: number, containerWidth: number): number {
  const upper = Math.min(MAX_LEFT, Math.max(MIN_LEFT, containerWidth - MIN_RIGHT));
  return Math.round(Math.max(MIN_LEFT, Math.min(value, upper)));
}

/**
 * 编辑页左右分栏：中间分隔条可拖拽（双击恢复默认，方向键微调）。
 * 左栏宽度写入 localStorage，刷新后保持；卡片列数由容器宽度决定。
 */
export function EditorSplit({
  doc,
  tokens,
  templateName,
  pages,
  paginating,
}: {
  doc: ResumeDoc;
  tokens: TemplateTokens;
  templateName: string;
  pages: ResumeDoc[];
  paginating: boolean;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState<number | null>(null);
  const [dragging, setDragging] = useState(false);
  const widthRef = useRef<number | null>(null);
  widthRef.current = width;

  // Restore a saved split.
  useEffect(() => {
    try {
      const saved = Number(window.localStorage.getItem(STORAGE_KEY));
      if (Number.isFinite(saved) && saved >= MIN_LEFT) {
        const container = containerRef.current;
        setWidth(clampWidth(saved, container?.clientWidth ?? window.innerWidth));
      }
    } catch {
      /* storage unavailable */
    }
  }, []);

  // Persist on change.
  useEffect(() => {
    if (width == null) return;
    try {
      window.localStorage.setItem(STORAGE_KEY, String(width));
    } catch {
      /* storage unavailable */
    }
  }, [width]);

  // Keep the split valid when the window resizes.
  useEffect(() => {
    const onResize = () => {
      const container = containerRef.current;
      if (!container) return;
      setWidth((current) =>
        current == null ? current : clampWidth(current, container.clientWidth),
      );
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  const currentLeftWidth = useCallback(() => {
    const container = containerRef.current;
    const aside = container?.querySelector("aside");
    return (
      widthRef.current ??
      aside?.getBoundingClientRect().width ??
      Math.max(MIN_LEFT, (container?.clientWidth ?? 1200) * 0.52)
    );
  }, []);

  const beginDrag = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      const container = containerRef.current;
      if (!container) return;
      // Do not preventDefault here: canceling pointerdown suppresses the
      // compatibility mouse events, which breaks double-click-to-reset.
      const rect = container.getBoundingClientRect();
      const startWidth = currentLeftWidth();
      const startX = event.clientX;
      setDragging(true);
      document.body.style.setProperty("user-select", "none");
      document.body.style.setProperty("cursor", "col-resize");

      const onMove = (moveEvent: PointerEvent) => {
        setWidth(clampWidth(startWidth + (moveEvent.clientX - startX), rect.width));
      };
      const onEnd = () => {
        setDragging(false);
        document.body.style.removeProperty("user-select");
        document.body.style.removeProperty("cursor");
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onEnd);
        window.removeEventListener("pointercancel", onEnd);
      };

      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onEnd);
      window.addEventListener("pointercancel", onEnd);
    },
    [currentLeftWidth],
  );

  const resetWidth = useCallback(() => {
    try {
      window.localStorage.removeItem(STORAGE_KEY);
    } catch {
      /* storage unavailable */
    }
    setWidth(null);
  }, []);

  const nudge = useCallback(
    (direction: -1 | 1) => {
      const container = containerRef.current;
      if (!container) return;
      setWidth(clampWidth(currentLeftWidth() + direction * 20, container.clientWidth));
    },
    [currentLeftWidth],
  );

  return (
    <div ref={containerRef} className="flex min-h-0 flex-1">
      <EditorPanel width={width} />
      <div
        role="separator"
        aria-orientation="vertical"
        aria-label="拖拽调整左右宽度"
        aria-valuenow={width ?? undefined}
        title="拖拽调整左右宽度（双击恢复默认）"
        tabIndex={0}
        onPointerDown={beginDrag}
        onDoubleClick={resetWidth}
        onKeyDown={(event) => {
          if (event.key === "ArrowLeft") {
            event.preventDefault();
            nudge(-1);
          } else if (event.key === "ArrowRight") {
            event.preventDefault();
            nudge(1);
          } else if (event.key === "Home") {
            event.preventDefault();
            resetWidth();
          }
        }}
        className={cn(
          "group relative z-20 hidden w-1.5 shrink-0 cursor-col-resize touch-none select-none bg-slate-200/70 transition-colors hover:bg-blue-400 focus:outline-none focus-visible:bg-blue-500 md:block",
          dragging && "bg-blue-500",
        )}
      >
        <span className="pointer-events-none absolute left-1/2 top-1/2 h-10 w-0.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white/80 shadow-sm" />
      </div>
      <PreviewPane
        doc={doc}
        tokens={tokens}
        templateName={templateName}
        pages={pages}
        paginating={paginating}
      />
    </div>
  );
}

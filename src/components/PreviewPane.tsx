"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { ResumeDoc, TemplateTokens } from "@/lib/types";
import { ResumePaper } from "@/components/preview/ResumePaper";
import { ExactTemplatePreview } from "@/components/preview/ExactTemplatePreview";
import {
  EXACT_HEIGHT_PX,
  EXACT_WIDTH_PX,
  getExactTemplateToken,
} from "@/lib/exact-template";
import { useResumeStore } from "@/store/useResumeStore";
import { A4_HEIGHT_PX, A4_WIDTH_PX } from "@/lib/paper";
import { useMembership } from "@/lib/use-membership";
import { WatermarkOverlay } from "@/components/preview/WatermarkOverlay";

export function PreviewPane({
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
  const outerRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0.82);
  const [exactReady, setExactReady] = useState(false);
  const [exactHeight, setExactHeight] = useState(EXACT_HEIGHT_PX);
  const exactToken = getExactTemplateToken(doc);
  const setOverflow = useResumeStore((state) => state.setOverflow);
  const membership = useMembership();
  const showWatermark = membership.payEnabled && !membership.active;

  useEffect(() => {
    setExactHeight(EXACT_HEIGHT_PX);
  }, [exactToken]);

  useEffect(() => {
    setOverflow(0, null);
  }, [setOverflow]);

  useEffect(() => {
    if (!exactToken) {
      setExactReady(false);
      return;
    }
    let cancelled = false;
    setExactReady(false);
    void fetch(`/template-pages/${encodeURIComponent(exactToken)}.html`, {
      method: "HEAD",
    })
      .then((response) => {
        if (!cancelled) setExactReady(response.ok);
      })
      .catch(() => {
        if (!cancelled) setExactReady(false);
      });
    return () => {
      cancelled = true;
    };
  }, [exactToken]);

  // Do NOT switch to the classic fallback on a transient bind failure — that
  // made the preview jump to a different template and never come back. Exact
  // availability is decided once by the HEAD check below.
  const markUnavailable = useCallback(() => {
    /* keep the exact preview; retries happen inside ExactTemplatePreview */
  }, []);

  useEffect(() => {
    const element = outerRef.current;
    if (!element) return;
    const update = () => {
      const available = element.clientWidth - 64;
      setScale(Math.min(1, Math.max(0.35, available / A4_WIDTH_PX)));
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  return (
    <section className="flex min-w-0 flex-1 flex-col bg-[#eef0f3]">
      <div className="flex h-10 shrink-0 items-center justify-between border-b border-slate-200 bg-white/80 px-4 backdrop-blur">
        <div className="flex items-center gap-2 text-[11px] text-slate-500">
          <span className="rounded bg-slate-100 px-1.5 py-0.5 text-slate-600">
            {templateName}
          </span>
          {exactReady ? (
            <span className="rounded bg-emerald-50 px-1.5 py-0.5 text-emerald-700">
              原站 DOM/CSS 1:1
            </span>
          ) : null}
          <span>{exactReady ? "A4 · 210 × 297mm" : "A4 · 210 × 297mm"}</span>
        </div>
        <div className="flex items-center gap-2 text-[11px] text-slate-400">
          {exactReady ? (
            <span className="rounded bg-slate-100 px-2 py-0.5 text-slate-600">
              共 {Math.max(1, Math.ceil((exactHeight - 20) / EXACT_HEIGHT_PX))} 页
            </span>
          ) : paginating ? (
            <span className="text-slate-400">排版中…</span>
          ) : (
            <span className="rounded bg-slate-100 px-2 py-0.5 text-slate-600">
              共 {pages.length} 页
            </span>
          )}
          <span className="tabular-nums">{Math.round(scale * 100)}%</span>
        </div>
      </div>

      <div ref={outerRef} className="thin-scroll flex-1 overflow-auto px-8 py-6">
        <div className="mx-auto flex flex-col items-center gap-6">
          {exactReady && exactToken ? (
            <div className="flex flex-col items-center gap-6">
              {Array.from({
                length: Math.max(
                  1,
                  Math.ceil((exactHeight - 20) / EXACT_HEIGHT_PX),
                ),
              }).map((_, pageIndex) => (
                <div key={pageIndex} className="flex flex-col items-center">
                  <div className="mb-1 text-[10px] text-slate-400">
                    原站模板渲染 · 第 {pageIndex + 1} 页 / 共{" "}
                    {Math.max(1, Math.ceil((exactHeight - 20) / EXACT_HEIGHT_PX))} 页
                  </div>
                  {/*
                    Render the captured page at its native 794×1123 CSS px, 1:1.
                    Wrapping it in a 210mm box and scaling by 793.7/794 makes every
                    glyph rasterize at 99.96%, so the preview stops being pixel
                    identical to the server-side 794px×DPR2 export.
                  */}
                  <div
                    style={{
                      width: EXACT_WIDTH_PX * scale,
                      height: EXACT_HEIGHT_PX * scale,
                    }}
                  >
                    <div
                      data-resume-page
                      className="page-frame page-shadow overflow-hidden bg-white"
                      style={{
                        width: EXACT_WIDTH_PX,
                        height: EXACT_HEIGHT_PX,
                        transform: `scale(${scale})`,
                        transformOrigin: "top left",
                      }}
                    >
                      <ExactTemplatePreview
                        token={exactToken}
                        doc={doc}
                        width={EXACT_WIDTH_PX}
                        offsetY={pageIndex * EXACT_HEIGHT_PX}
                        clipHeight={EXACT_HEIGHT_PX}
                        watermark={showWatermark}
                        onUnavailable={markUnavailable}
                        onHeight={pageIndex === 0 ? setExactHeight : undefined}
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            pages.map((pageDoc, index) => (
              <div key={`${index}-${pageDoc.sections.length}`} className="flex flex-col items-center">
                <div className="mb-1 text-[10px] text-slate-400">
                  第 {index + 1} 页 / 共 {pages.length} 页
                </div>
                <div
                  style={{
                    width: A4_WIDTH_PX * scale,
                    height: A4_HEIGHT_PX * scale,
                  }}
                >
                  <div
                    style={{
                      width: A4_WIDTH_PX,
                      height: A4_HEIGHT_PX,
                      transform: `scale(${scale})`,
                      transformOrigin: "top left",
                    }}
                  >
                    <div
                      data-resume-page
                      className="page-frame page-shadow"
                      style={{ width: "210mm", height: "297mm", position: "relative" }}
                    >
                      <ResumePaper doc={pageDoc} tokens={tokens} />
                      {showWatermark ? <WatermarkOverlay /> : null}
                    </div>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </section>
  );
}

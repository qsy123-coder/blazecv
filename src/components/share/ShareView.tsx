"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import type { ResumeDoc, TemplateTokens } from "@/lib/types";
import { ResumePaper } from "@/components/preview/ResumePaper";
import { ExactTemplatePreview } from "@/components/preview/ExactTemplatePreview";
import { usePagination } from "@/components/preview/usePagination";
import { TEMPLATE_ASSET_VERSION } from "@/lib/template-version";
import {
  EXACT_HEIGHT_PX,
  EXACT_WIDTH_PX,
  getExactTemplateToken,
} from "@/lib/exact-template";
import { exportExactPdf } from "@/lib/exact-export";
import { Icon } from "@/components/icons";
import { Button } from "@/components/ui";
import { A4_HEIGHT_PX, A4_WIDTH_PX } from "@/lib/paper";

export function ShareView({
  doc,
  tokens,
}: {
  doc: ResumeDoc;
  tokens: TemplateTokens;
}) {
  const outerRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0.8);
  const [exactReady, setExactReady] = useState(false);
  const [exactHeight, setExactHeight] = useState(EXACT_HEIGHT_PX);
  const exactToken = getExactTemplateToken(doc);
  const { pages, paginating } = usePagination(doc, tokens);
  const effectivePages = pages.length > 0 ? pages : [doc];

  useEffect(() => {
    setExactHeight(EXACT_HEIGHT_PX);
  }, [exactToken]);

  useEffect(() => {
    const element = outerRef.current;
    if (!element) return;
    const update = () => {
      const available = element.clientWidth - 32;
      setScale(Math.min(1, Math.max(0.3, available / A4_WIDTH_PX)));
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!exactToken) {
      setExactReady(false);
      return;
    }
    let cancelled = false;
    setExactReady(false);
    void fetch(`/template-pages/${encodeURIComponent(exactToken)}.html${TEMPLATE_ASSET_VERSION}`, {
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

  const markUnavailable = useCallback(() => {
    /* keep the exact preview on transient bind failures (see PreviewPane) */
  }, []);

  const print = async () => {
    if (exactReady && exactToken) {
      if (await exportExactPdf(doc, doc.title)) return;
      window.alert("PDF 生成失败，请改用浏览器打印或稍后重试。");
      return;
    }
    window.print();
  };

  return (
    <div className="share-shell flex min-h-screen flex-col bg-slate-100">
      <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/90 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-3 px-4">
          <Link href="/" className="flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-md bg-slate-900 text-[13px] font-bold text-white">
              B
            </div>
            <span className="text-[15px] font-semibold tracking-tight">BlazeCV</span>
          </Link>
          <div className="hidden items-center gap-2 text-[11px] text-slate-400 sm:flex">
            <span>只读分享 · 内容由作者发布</span>
            {exactReady ? (
              <span>· 原站模板渲染 · 1 页</span>
            ) : !paginating ? (
              <span>· 共 {effectivePages.length} 页</span>
            ) : null}
          </div>
          <Button size="sm" onClick={() => void print()}>
            <Icon name="printer" size={14} />
            {exactReady ? "保存 PDF" : "打印 / 保存 PDF"}
          </Button>
        </div>
      </header>

      <main ref={outerRef} className="thin-scroll flex-1 overflow-auto px-4 py-6">
        <div className="mx-auto flex flex-col items-center gap-6">
          {exactReady && exactToken ? (
            <div className="flex flex-col items-center gap-6">
              {Array.from({
                length: Math.max(1, Math.ceil((exactHeight - 20) / EXACT_HEIGHT_PX)),
              }).map((_, pageIndex) => (
                <div key={pageIndex} className="flex flex-col items-center">
                  <div className="mb-1 text-[10px] text-slate-400">
                    原站模板渲染 · 第 {pageIndex + 1} 页 / 共{" "}
                    {Math.max(1, Math.ceil((exactHeight - 20) / EXACT_HEIGHT_PX))} 页
                  </div>
                  {/* Native 794×1123 CSS px, 1:1 with the server-side export. */}
                  <div
                    style={{
                      width: EXACT_WIDTH_PX * scale,
                      height: EXACT_HEIGHT_PX * scale,
                    }}
                  >
                    <div
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
                        onUnavailable={markUnavailable}
                        onHeight={pageIndex === 0 ? setExactHeight : undefined}
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            effectivePages.map((pageDoc, index) => (
              <div key={index} className="flex flex-col items-center">
                <div className="mb-1 text-[10px] text-slate-400">
                  第 {index + 1} 页 / 共 {effectivePages.length} 页
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
                      className="page-frame page-shadow"
                      style={{ width: "210mm", height: "297mm" }}
                    >
                      <ResumePaper doc={pageDoc} tokens={tokens} />
                    </div>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </main>

      <footer className="border-t border-slate-200 bg-white px-4 py-3 text-center text-[10px] text-slate-400">
        由 BlazeCV 生成 · 只读分享
      </footer>

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
    </div>
  );
}

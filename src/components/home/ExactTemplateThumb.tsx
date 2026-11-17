"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { ResumeDoc } from "@/lib/types";
import {
  applyExactTemplate,
  EXACT_HEIGHT_PX,
  EXACT_WIDTH_PX,
} from "@/lib/exact-template";
import { EXACT_PREVIEW_CSS } from "@/components/preview/ExactTemplatePreview";
import { getCachedThumb, putCachedThumb } from "@/lib/storage";

// Binding a full template is heavy; the library can mount dozens of cards at
// once. Keep a small shared queue so opening the page does not lock the main
// thread, while still filling every card without requiring a scroll.
const MAX_CONCURRENT_APPLIES = 4;
let runningApplies = 0;
const applyWaiters: Array<() => void> = [];

async function acquireApplySlot(): Promise<void> {
  if (runningApplies < MAX_CONCURRENT_APPLIES) {
    runningApplies += 1;
    return;
  }
  await new Promise<void>((resolve) => {
    applyWaiters.push(() => {
      runningApplies += 1;
      resolve();
    });
  });
}

function releaseApplySlot() {
  runningApplies -= 1;
  applyWaiters.shift()?.();
}

function serializeBoundDocument(source: Document): string {
  const clone = source.documentElement.cloneNode(true) as HTMLElement;
  // The captured page is static; scripts are never part of the bound snapshot.
  clone.querySelectorAll("script").forEach((node) => node.remove());
  return `<!doctype html>${clone.outerHTML}`;
}

/**
 * First-page card thumbnail drawn from the same captured template page and the
 * same binder as the editor preview. The bound document is cached in IndexedDB
 * per resume revision, so revisits render the finished page directly instead of
 * fetching the template and running the binder again.
 */
export function ExactTemplateThumb({
  token,
  doc,
  scale,
  cacheKey,
  onUnavailable,
}: {
  token: string;
  doc: ResumeDoc;
  scale: number;
  /** Bound-snapshot key; null disables caching (e.g. template picker previews). */
  cacheKey: string | null;
  onUnavailable?: () => void;
}) {
  const ref = useRef<HTMLIFrameElement>(null);
  const originalRef = useRef<string | null>(null);
  const unavailableRef = useRef(onUnavailable);
  const [cachedHtml, setCachedHtml] = useState<string | null>(null);
  const [cacheChecked, setCacheChecked] = useState(cacheKey === null);
  const [ready, setReady] = useState(false);
  const [pageHeight, setPageHeight] = useState(EXACT_HEIGHT_PX);

  useEffect(() => {
    unavailableRef.current = onUnavailable;
  }, [onUnavailable]);

  useEffect(() => {
    let cancelled = false;
    setReady(false);
    originalRef.current = null;
    setCachedHtml(null);
    if (!cacheKey) {
      setCacheChecked(true);
      return;
    }
    setCacheChecked(false);
    void getCachedThumb(cacheKey)
      .then((html) => {
        if (!cancelled) setCachedHtml(html);
      })
      .catch(() => undefined)
      .finally(() => {
        if (!cancelled) setCacheChecked(true);
      });
    return () => {
      cancelled = true;
    };
  }, [cacheKey]);

  const apply = useCallback(async () => {
    await acquireApplySlot();
    try {
      const frame = ref.current;
      if (!frame?.isConnected) return;
      const frameDocument = frame.contentDocument;
      const root = frameDocument?.querySelector<HTMLElement>("#cv-container");
      if (!frameDocument || !root) {
        unavailableRef.current?.();
        return;
      }
      if (!frameDocument.getElementById("blazecv-exact-style")) {
        const style = frameDocument.createElement("style");
        style.id = "blazecv-exact-style";
        style.textContent = EXACT_PREVIEW_CSS;
        frameDocument.head.appendChild(style);
      }
      if (originalRef.current === null) originalRef.current = root.innerHTML;
      else root.innerHTML = originalRef.current;
      let height = EXACT_HEIGHT_PX;
      try {
        height = await applyExactTemplate(root, doc);
      } catch {
        // Same one-shot retry as the editor preview: fonts/layout may not be
        // ready on the first frame. A real failure falls back to classic.
        await new Promise((resolve) => window.setTimeout(resolve, 300));
        try {
          height = await applyExactTemplate(root, doc);
        } catch {
          unavailableRef.current?.();
          return;
        }
      }
      setPageHeight(height);
      if (frame.isConnected) frame.style.height = `${height}px`;

      // Snapshot only after the binder finished, so the cache is exactly the
      // first A4 page the editor would show.
      if (cacheKey) {
        try {
          void putCachedThumb(
            cacheKey,
            doc.id ?? "",
            doc.updatedAt ?? Date.now(),
            serializeBoundDocument(frameDocument),
          ).catch(() => undefined);
        } catch {
          /* quota / private mode: keep rendering without the cache */
        }
      }
    } finally {
      releaseApplySlot();
    }
  }, [cacheKey, doc]);

  useEffect(() => {
    if (!ready || cachedHtml) return;
    const handle = window.requestAnimationFrame(() => {
      void apply();
    });
    return () => window.cancelAnimationFrame(handle);
  }, [apply, ready, cachedHtml]);

  const handleLoad = useCallback(() => {
    const frame = ref.current;
    const frameDocument = frame?.contentDocument;
    if (cachedHtml) {
      if (!frameDocument?.querySelector("#cv-container")) {
        // Corrupt/incompatible snapshot: drop it and fall back to the network.
        setCachedHtml(null);
        return;
      }
      const main = frameDocument.querySelector<HTMLElement>(".main");
      const inline = main?.style.height ? Number.parseFloat(main.style.height) : NaN;
      const height =
        Number.isFinite(inline) && inline > 0 ? Math.ceil(inline) : EXACT_HEIGHT_PX;
      setPageHeight(height);
      if (frame) frame.style.height = `${height}px`;
      setReady(true);
      return;
    }
    setReady(true);
  }, [cachedHtml]);

  const srcProps = cachedHtml
    ? ({ srcDoc: cachedHtml } as const)
    : ({ src: `/template-pages/${encodeURIComponent(token)}.html` } as const);

  return (
    <div
      aria-hidden="true"
      className="relative overflow-hidden rounded bg-slate-100"
      style={{ width: EXACT_WIDTH_PX * scale, height: EXACT_HEIGHT_PX * scale }}
    >
      {/* 1:1 with the editor preview / export: no 210mm→794 scale wrapper. */}
      <div
        style={{
          width: EXACT_WIDTH_PX,
          height: EXACT_HEIGHT_PX,
          overflow: "hidden",
          transform: `scale(${scale})`,
          transformOrigin: "top left",
        }}
      >
        {cacheChecked ? (
          <iframe
            ref={ref}
            title="模板预览缩略图"
            {...srcProps}
            width={EXACT_WIDTH_PX}
            height={pageHeight}
            scrolling="no"
            onLoad={handleLoad}
            style={{
              width: EXACT_WIDTH_PX,
              height: pageHeight,
              border: 0,
              display: "block",
              background: "#fff",
              pointerEvents: "none",
            }}
          />
        ) : null}
      </div>
      {ready ? null : (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-slate-50 text-[10px] text-slate-400">
          预览生成中…
        </div>
      )}
    </div>
  );
}

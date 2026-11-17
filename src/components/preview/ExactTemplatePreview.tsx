"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { ResumeDoc, Theme } from "@/lib/types";
import {
  applyExactTemplate,
  applyExactTheme,
  EXACT_HEIGHT_PX,
  EXACT_WIDTH_PX,
} from "@/lib/exact-template";

export const EXACT_PREVIEW_CSS = `
@font-face {
  font-family: "iconfont";
  src: url("/wondercv-assets/iconfont.woff2") format("woff2");
  font-display: swap;
}
html, body { margin: 0; padding: 0; background: #fff; width: 794px; }
#cv-container { width: 794px !important; }
.cover { z-index: 0 !important; }
.cover-transparent { z-index: 1 !important; }
.site-header, .pc-nav, .footer, .template-action, .copy-button, .fixed-tools { display: none !important; }
`;

export function ExactTemplatePreview({
  token,
  doc,
  width = EXACT_WIDTH_PX,
  offsetY = 0,
  clipHeight,
  onUnavailable,
  onHeight,
}: {
  token: string;
  doc: ResumeDoc;
  width?: number;
  /** Page slice: show the tall render offset by this many px inside a clip box. */
  offsetY?: number;
  /** Clip box height (one A4 page). Defaults to the full natural height. */
  clipHeight?: number;
  onUnavailable?: () => void;
  onHeight?: (height: number) => void;
}) {
  const ref = useRef<HTMLIFrameElement>(null);
  const originalRef = useRef<string | null>(null);
  /** Bound DOM before theme overrides; auto-fit restores it per candidate. */
  const boundHtmlRef = useRef<string | null>(null);
  const docRef = useRef(doc);
  const [ready, setReady] = useState(false);
  const [loadedToken, setLoadedToken] = useState(token);
  const [pageHeight, setPageHeight] = useState(EXACT_HEIGHT_PX);

  useEffect(() => {
    docRef.current = doc;
  }, [doc]);

  useEffect(() => {
    if (loadedToken !== token) {
      setReady(false);
      originalRef.current = null;
      setLoadedToken(token);
    }
  }, [token, loadedToken]);

  const apply = useCallback(async () => {
    const frame = ref.current;
    const frameDocument = frame?.contentDocument;
    const root = frameDocument?.querySelector<HTMLElement>("#cv-container");
    if (!frameDocument || !root) {
      onUnavailable?.();
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
      height = await applyExactTemplate(root, doc, {
        onBind: (html) => {
          boundHtmlRef.current = html;
        },
      });
    } catch {
      // A transient failure (fonts/layout not ready) must not switch templates;
      // retry once before giving up.
      await new Promise((r) => window.setTimeout(r, 300));
      try {
        height = await applyExactTemplate(root, doc, {
          onBind: (html) => {
            boundHtmlRef.current = html;
          },
        });
      } catch {
        onUnavailable?.();
        return;
      }
    }
    setPageHeight(height);
    onHeight?.(height);
    if (frame) frame.style.height = `${height}px`;
    if (!root.querySelector(".option")) onUnavailable?.();
  }, [doc, onUnavailable, onHeight]);

  useEffect(() => {
    if (!ready) return;
    const handle = window.requestAnimationFrame(() => {
      void apply();
    });
    return () => window.cancelAnimationFrame(handle);
  }, [apply, ready]);

  // Auto-fit measurement hook for the editor (ThemePanel). Restores the bound
  // DOM and tries a candidate theme without a store update / React round-trip:
  // a full 字号×行距×页边距 grid finishes in a few hundred milliseconds.
  useEffect(() => {
    if (!ready) return;
    const frame = ref.current;
    const win = frame?.contentWindow as
      | (Window & { __blazecvMeasureTheme?: (theme: Theme) => Promise<number | null> })
      | null;
    if (!win) return;
    win.__blazecvMeasureTheme = async (theme: Theme) => {
      const root = frame?.contentDocument?.querySelector<HTMLElement>("#cv-container");
      if (!root || boundHtmlRef.current === null) return null;
      root.innerHTML = boundHtmlRef.current;
      return applyExactTheme(root, { ...docRef.current, theme }, { fast: true });
    };
    return () => {
      try {
        delete win.__blazecvMeasureTheme;
      } catch {
        win.__blazecvMeasureTheme = undefined;
      }
    };
  }, [ready]);

  const boxHeight = clipHeight ?? pageHeight;
  return (
    <div
      style={{
        width,
        height: boxHeight,
        overflow: "hidden",
        position: "relative",
        background: "#fff",
      }}
    >
      <iframe
        ref={ref}
        title="原站模板 1:1 预览"
        src={`/template-pages/${encodeURIComponent(token)}.html`}
        width={width}
        height={pageHeight}
        scrolling="no"
        onLoad={() => setReady(true)}
        style={{
          width,
          height: pageHeight,
          border: 0,
          display: "block",
          background: "#fff",
          position: "absolute",
          left: 0,
          top: -offsetY,
        }}
      />
    </div>
  );
}

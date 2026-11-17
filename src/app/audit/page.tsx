"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import type { ResumeDoc, Section } from "@/lib/types";
import { createBlankResume } from "@/lib/sample";
import {
  applyExactTemplate,
  EXACT_HEIGHT_PX,
  EXACT_WIDTH_PX,
  getExactTemplateToken,
} from "@/lib/exact-template";

const PREVIEW_CSS = `
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

declare global {
  interface Window {
    __auditApply?: () => Promise<number>;
    __auditOriginal?: string | null;
  }
}

function AuditView() {
  const params = useSearchParams();
  const token = params.get("token") ?? "";
  const docParam = params.get("doc");
  const [doc, setDoc] = useState<ResumeDoc | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [ready, setReady] = useState(false);
  const [height, setHeight] = useState(EXACT_HEIGHT_PX);
  const frameRef = useRef<HTMLIFrameElement>(null);
  const docRef = useRef<ResumeDoc | null>(null);
  docRef.current = doc;

  useEffect(() => {
    let cancelled = false;
    // Explicit document passed in (used by the server-side export renderer).
    if (docParam) {
      try {
        const bin = atob(docParam);
        const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
        const json = new TextDecoder().decode(bytes);
        const provided = JSON.parse(json) as ResumeDoc;
        setDoc(provided);
        return () => {
          cancelled = true;
        };
      } catch {
        /* fall through to template-content */
      }
    }
    if (!token) return;
    setLoaded(false);
    setReady(false);
    setHeight(EXACT_HEIGHT_PX);
    void fetch(`/template-content/${encodeURIComponent(token)}.json`)
      .then(async (response) => {
        const content = response.ok
          ? ((await response.json()) as {
              title?: string;
              basics?: Partial<ResumeDoc["basics"]>;
              sections?: Section[];
            })
          : null;
        if (cancelled) return;
        const base = createBlankResume("audit");
        // Neutral theme so the exact render is 1:1 (no font/line scaling).
        base.theme = { ...base.theme, lineHeight: 1.2, fontScale: "md", margin: 10 };
        if (content?.basics) {
          base.basics = {
            ...base.basics,
            ...content.basics,
            links: content.basics.links ?? base.basics.links,
          };
        }
        if (content?.sections?.length) base.sections = content.sections;
        if (content?.title) base.title = content.title;
        setDoc(base);
      })
      .catch(() => {
        if (!cancelled) setDoc(createBlankResume("audit"));
      });
    return () => {
      cancelled = true;
    };
  }, [token]);

  // Expose a manual "apply the binder" hook so the audit harness can capture
  // the untouched original render first, then the bound render, in ONE page
  // load. This halves the per-template audit cost.
  useEffect(() => {
    window.__auditApply = async () => {
      const frame = frameRef.current;
      const frameDocument = frame?.contentDocument;
      const root = frameDocument?.querySelector<HTMLElement>("#cv-container");
      const currentDoc = docRef.current;
      if (!frameDocument || !root || !currentDoc) return EXACT_HEIGHT_PX;
      if (!frameDocument.getElementById("blazecv-exact-style")) {
        const style = frameDocument.createElement("style");
        style.id = "blazecv-exact-style";
        style.textContent = PREVIEW_CSS;
        frameDocument.head.appendChild(style);
      }
      if (window.__auditOriginal == null) {
        window.__auditOriginal = root.innerHTML;
      } else {
        root.innerHTML = window.__auditOriginal;
      }
      const h = await applyExactTemplate(root, currentDoc);
      if (frame) frame.style.height = `${h}px`;
      setHeight(h);
      return h;
    };
    return () => {
      window.__auditApply = undefined;
    };
  }, []);

  const onFrameLoad = async () => {
    const frame = frameRef.current;
    const frameDocument = frame?.contentDocument;
    const root = frameDocument?.querySelector<HTMLElement>("#cv-container");
    if (!frameDocument || !root) return;
    if (!frameDocument.getElementById("blazecv-exact-style")) {
      const style = frameDocument.createElement("style");
      style.id = "blazecv-exact-style";
      style.textContent = PREVIEW_CSS;
      frameDocument.head.appendChild(style);
    }
    // Capture the untouched original HTML before touching layout, so the binder
    // can restore it exactly.
    window.__auditOriginal = root.innerHTML;
    // Render the RAW page at its natural height (min A4), same rule the binder
    // uses, so raw and bound are captured at identical dimensions.
    const main = root.querySelector<HTMLElement>(".main");
    if (main) {
      main.style.removeProperty("zoom");
      main.style.setProperty("width", `${EXACT_WIDTH_PX}px`, "important");
      main.style.setProperty("height", "auto");
      main.style.setProperty("min-height", `${EXACT_HEIGHT_PX}px`);
      const content = root.querySelector<HTMLElement>(".content");
      if (content) {
        content.style.height = "auto";
        content.style.overflow = "visible";
      }
      const scroll = root.querySelector<HTMLElement>(".content-scroll");
      if (scroll) {
        scroll.style.height = "auto";
        scroll.style.overflow = "visible";
      }
      await new Promise<void>((r) => window.requestAnimationFrame(() => r()));
      await frameDocument.fonts?.ready.catch(() => undefined);
      const h = Math.max(
        EXACT_HEIGHT_PX,
        Math.ceil(main.getBoundingClientRect().height),
      );
      main.style.setProperty("min-height", "0");
      main.style.setProperty("height", `${h}px`, "important");
      root.style.setProperty("height", `${h}px`, "important");
      if (frame) frame.style.height = `${h}px`;
      setHeight(h);
    }
    setLoaded(true);
  };

  useEffect(() => {
    if (loaded && doc) {
      // Wait a beat for fonts/images to settle before the harness reads it.
      const t = window.setTimeout(() => setReady(true), 250);
      return () => window.clearTimeout(t);
    }
  }, [loaded, doc]);

  // Same resolution as the editor: preset source token → wcx-<token> templateId.
  // The editor strips templatePreset from saved docs, so falling back only to
  // preset.source.token made /audit render no iframe and the export client
  // silently fell back to html-to-image (export ≠ preview).
  const frameToken = token || (doc ? getExactTemplateToken(doc) ?? "" : "");

  return (
    <div
      data-audit-token={frameToken}
      data-audit-ready={ready ? "1" : "0"}
      data-audit-height={height}
      style={{
        width: EXACT_WIDTH_PX,
        height,
        margin: 0,
        padding: 0,
        background: "#fff",
        overflow: "hidden",
      }}
    >
      {frameToken ? (
        <iframe
          ref={frameRef}
          title="原站模板 1:1 预览"
          src={`/template-pages/${encodeURIComponent(frameToken)}.html`}
          width={EXACT_WIDTH_PX}
          height={height}
          scrolling="no"
          onLoad={onFrameLoad}
          style={{
            width: EXACT_WIDTH_PX,
            height,
            border: 0,
            display: "block",
            background: "#fff",
          }}
        />
      ) : (
        <div
          style={{ width: EXACT_WIDTH_PX, height: EXACT_HEIGHT_PX, background: "#fff" }}
        />
      )}
    </div>
  );
}

export default function AuditPage() {
  return (
    <main style={{ margin: 0, padding: 0, background: "#fff" }}>
      <Suspense
        fallback={
          <div
            style={{
              width: EXACT_WIDTH_PX,
              height: EXACT_HEIGHT_PX,
              background: "#fff",
            }}
          />
        }
      >
        <AuditView />
      </Suspense>
    </main>
  );
}

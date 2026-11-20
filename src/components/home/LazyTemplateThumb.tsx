"use client";

import { TEMPLATE_ASSET_VERSION } from "@/lib/template-version";

import { useEffect, useMemo, useRef, useState } from "react";
import type { ResumeDoc, TemplateId } from "@/lib/types";
import { getTemplate } from "@/lib/templates";
import {
  EXACT_HEIGHT_PX,
  EXACT_WIDTH_PX,
  getExactTemplateToken,
} from "@/lib/exact-template";
import { ExactTemplateThumb } from "./ExactTemplateThumb";
import { TemplateThumb } from "./TemplateThumb";

export function LazyTemplateThumb({
  doc,
  templateId,
  scale,
}: {
  doc: ResumeDoc;
  templateId: TemplateId;
  scale: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  const [exactFailed, setExactFailed] = useState(false);
  const [previewBroken, setPreviewBroken] = useState(false);

  // Bind the thumbnail to the template being previewed, not to whatever the
  // document was last saved with (template pickers enumerate other presets).
  const thumbDoc = useMemo<ResumeDoc>(() => {
    if (doc.templateId === templateId && doc.templatePreset) return doc;
    return { ...doc, templateId, templatePreset: getTemplate(templateId) };
  }, [doc, templateId]);
  const exactToken = getExactTemplateToken(thumbDoc);
  // Cache only the document's own template. Template-picker cards synthesize a
  // doc for another preset; caching those would evict the library snapshot.
  const cacheKey =
    exactToken && thumbDoc === doc
      ? `thumb-v3:${doc.id ?? ""}:${doc.updatedAt ?? 0}:${exactToken}`
      : null;

  useEffect(() => {
    setExactFailed(false);
    setPreviewBroken(false);
  }, [exactToken]);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    if (typeof IntersectionObserver === "undefined") {
      setVisible(true);
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setVisible(true);
          observer.disconnect();
        }
      },
      // Mount exact iframes only around the viewport. Far-away cards use the
      // cheap template preview image, so opening a large library stays fast
      // while never showing a blank page.
      { rootMargin: "600px" },
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  // Official template preview image: instant, same aspect, same design. It is
  // replaced by the exact render as soon as the card approaches the viewport.
  const previewSrc = exactToken
    ? `/template-thumbs/${encodeURIComponent(exactToken)}.webp${TEMPLATE_ASSET_VERSION}`
    : null;
  const showPreview = Boolean(previewSrc && !previewBroken);

  return (
    <div
      ref={ref}
      style={{ width: EXACT_WIDTH_PX * scale, height: EXACT_HEIGHT_PX * scale }}
      className="relative flex items-center justify-center overflow-hidden rounded bg-slate-50"
    >
      {showPreview ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={previewSrc ?? undefined}
          alt=""
          aria-hidden="true"
          loading="lazy"
          onError={() => setPreviewBroken(true)}
          className="absolute inset-0 h-full w-full object-contain"
        />
      ) : null}

      {exactToken ? (
        visible ? (
          exactFailed ? (
            <TemplateThumb doc={doc} templateId={templateId} scale={scale} />
          ) : (
            <div className="relative z-10">
              <ExactTemplateThumb
                token={exactToken}
                doc={thumbDoc}
                scale={scale}
                cacheKey={cacheKey}
                onUnavailable={() => setExactFailed(true)}
              />
            </div>
          )
        ) : showPreview ? null : (
          <span className="relative z-10 animate-pulse text-[10px] text-slate-300">
            预览生成中…
          </span>
        )
      ) : (
        <TemplateThumb doc={doc} templateId={templateId} scale={scale} />
      )}
    </div>
  );
}

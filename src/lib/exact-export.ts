import type { ResumeDoc } from "./types";
import {
  applyExactTemplate,
  EXACT_HEIGHT_PX,
  EXACT_WIDTH_PX,
  getExactTemplateToken,
} from "./exact-template";
import { downloadBlob, safeFileName, todayStamp } from "./utils";

/** Optional UI callback so long exports can show a progress message. */
export type ExportProgress = (detail: string) => void;

const EXTRA_CSS = `
* {
  -webkit-print-color-adjust: exact !important;
  print-color-adjust: exact !important;
}
.cover { z-index: 0 !important; }
.cover-transparent { z-index: 1 !important; }
`;

const CSS_LINK_ID = "__blazecv_export_css";
const FONT_STYLE_ID = "__blazecv_export_font";

/** The server is authoritative for the payment gate; notify the editor UI. */
function noteWatermark(response: Response): void {
  if (response.headers.get("X-Watermark") !== "1") return;
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event("blazecv:watermarked"));
  }
}

async function iconfontCss(): Promise<string> {
  try {
    const fontResponse = await fetch("/wondercv-assets/iconfont.woff2");
    if (!fontResponse.ok) return "";
    const buffer = new Uint8Array(await fontResponse.arrayBuffer());
    let binary = "";
    for (let offset = 0; offset < buffer.length; offset += 0x8000) {
      binary += String.fromCharCode(...buffer.subarray(offset, offset + 0x8000));
    }
    return `@font-face{font-family:"iconfont";src:url(data:font/woff2;base64,${btoa(
      binary,
    )}) format("woff2");font-display:swap;}`;
  } catch {
    return "";
  }
}

/** Ensure the template's own stylesheet + iconfont are present in the current
 * document so the offscreen export node is laid out exactly like the editor. */
async function ensureExportStyles(fontCss: string) {
  if (!document.getElementById(CSS_LINK_ID)) {
    const link = document.createElement("link");
    link.id = CSS_LINK_ID;
    link.rel = "stylesheet";
    link.href = "/wondercv-assets/template-base.css";
    document.head.appendChild(link);
    await new Promise<void>((resolve) => {
      link.addEventListener("load", () => resolve(), { once: true });
      link.addEventListener("error", () => resolve(), { once: true });
      window.setTimeout(resolve, 1500);
    });
  }
  if (!document.getElementById(FONT_STYLE_ID)) {
    const style = document.createElement("style");
    style.id = FONT_STYLE_ID;
    style.textContent = fontCss + EXTRA_CSS;
    document.head.appendChild(style);
  }
  await document.fonts?.ready.catch(() => undefined);
}

/** Natural page height (min one A4) for a node that is already bound. */
async function layoutNatural(root: HTMLElement): Promise<number> {
  const main = root.querySelector<HTMLElement>(".main");
  if (!main) return EXACT_HEIGHT_PX;
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
  const raf = () =>
    new Promise<void>((r) => window.requestAnimationFrame(() => r()));
  await raf();
  await document.fonts?.ready.catch(() => undefined);
  await raf();
  const h = Math.max(EXACT_HEIGHT_PX, Math.ceil(main.getBoundingClientRect().height));
  main.style.setProperty("min-height", "0");
  main.style.setProperty("height", `${h}px`, "important");
  root.style.setProperty("height", `${h}px`, "important");
  root.style.setProperty("width", `${EXACT_WIDTH_PX}px`, "important");
  root
    .querySelectorAll<HTMLElement>(
      ".left-profile-wrapper, .left-profile-wrapper .profile-content",
    )
    .forEach((node) => {
      node.style.setProperty("height", `${h}px`, "important");
      node.style.setProperty("min-height", `${h}px`, "important");
    });
  return h;
}

/** Inline external images as same-origin data URLs so html-to-image embeds them
 * (cross-origin fetch is blocked, which used to drop avatars/banners). */
async function inlineExternalImages(node: HTMLElement) {
  const doc = node.ownerDocument;
  if (!doc) return;
  const origin = window.location.origin;
  const isExternal = (u: string) => /^https?:\/\//i.test(u) && !u.startsWith(origin);
  const cache = new Map<string, string | null>();
  const toDataUrl = async (src: string): Promise<string | null> => {
    if (cache.has(src)) return cache.get(src) ?? null;
    try {
      const res = await fetch(`/api/img-proxy?u=${encodeURIComponent(src)}`);
      if (!res.ok) {
        cache.set(src, null);
        return null;
      }
      const blob = await res.blob();
      const dataUrl = await new Promise<string>((resolve) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result ?? ""));
        reader.onerror = () => resolve("");
        reader.readAsDataURL(blob);
      });
      const value = dataUrl || null;
      cache.set(src, value);
      return value;
    } catch {
      cache.set(src, null);
      return null;
    }
  };
  const imgs = Array.from(node.querySelectorAll("img"));
  await Promise.all(
    imgs.map(async (img) => {
      const src = img.getAttribute("src") ?? "";
      if (!isExternal(src)) return;
      const data = await toDataUrl(src);
      if (data) {
        img.setAttribute("src", data);
        img.removeAttribute("srcset");
        await img.decode?.().catch(() => undefined);
      }
    }),
  );
  const styled = Array.from(node.querySelectorAll<HTMLElement>('[style*="url("]'));
  await Promise.all(
    styled.map(async (el) => {
      const style = el.getAttribute("style") ?? "";
      const re = /url\((['"]?)(https?:\/\/[^)'"]+)\1\)/g;
      let out = style;
      let changed = false;
      for (const m of [...style.matchAll(re)]) {
        if (!isExternal(m[2])) continue;
        const data = await toDataUrl(m[2]);
        if (data) {
          out = out.split(m[0]).join(`url("${data}")`);
          changed = true;
        }
      }
      if (changed) el.setAttribute("style", out);
    }),
  );
}

/**
 * Render the resume to a PNG at the template's natural page height by placing an
 * offscreen node in the CURRENT document (which also has the template CSS and
 * iconfont) and rasterising it with html-to-image. Rendering in the same document
 * — instead of a cross-document iframe — keeps html-to-image's computed-style
 * copy faithful (font-size, font-weight, line-height), which is why the exported
 * file now matches the editor/preview (bold, spacing, icons, images).
 */
async function renderExactPng(
  doc: ResumeDoc,
  onProgress?: ExportProgress,
): Promise<{ dataUrl: string; width: number; height: number } | null> {
  const token = getExactTemplateToken(doc);
  if (!token) return null;

  // Preferred: server-side native browser render (pixel-faithful to the editor).
  try {
    onProgress?.("正在请求服务端渲染…");
    const res = await fetch("/api/export-image", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ doc }),
    });
    if (res.ok) {
      noteWatermark(res);
      onProgress?.("正在读取渲染结果…");
      const height = Number(res.headers.get("X-Page-Height") ?? 0);
      const blob = await res.blob();
      const dataUrl = await new Promise<string>((resolve) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result ?? ""));
        reader.readAsDataURL(blob);
      });
      if (dataUrl) {
        return { dataUrl, width: EXACT_WIDTH_PX, height: height || EXACT_HEIGHT_PX };
      }
    }
  } catch {
    /* fall back to html-to-image below */
  }

  onProgress?.("服务端渲染不可用，正在本地渲染…");
  const response = await fetch(`/template-pages/${encodeURIComponent(token)}.html`);
  if (!response.ok) return null;
  const source = await response.text();
  const parsed = new DOMParser().parseFromString(source, "text/html");
  const parsedRoot = parsed.querySelector<HTMLElement>("#cv-container");
  if (!parsedRoot) return null;

  // Bind the content on the detached document (structure only, no layout).
  await applyExactTemplate(parsedRoot, doc, { fit: false });
  const boundHtml = parsedRoot.outerHTML;
  const fontCss = await iconfontCss();

  const host = document.createElement("div");
  host.setAttribute("data-blazecv-export-host", "1");
  host.style.cssText =
    `position:fixed;left:-100000px;top:0;width:${EXACT_WIDTH_PX}px;background:#fff;z-index:-1;`;
  host.innerHTML = boundHtml;
  document.body.appendChild(host);

  try {
    const liveRoot = host.querySelector<HTMLElement>("#cv-container");
    if (!liveRoot) return null;
    await ensureExportStyles(fontCss);
    const finalHeight = await layoutNatural(liveRoot);
    await inlineExternalImages(liveRoot);
    await document.fonts?.ready.catch(() => undefined);
    await new Promise<void>((r) => window.requestAnimationFrame(() => r()));

    const { toPng } = await import("html-to-image");
    const dataUrl = await toPng(liveRoot, {
      pixelRatio: 2,
      backgroundColor: "#ffffff",
      cacheBust: true,
      width: EXACT_WIDTH_PX,
      height: finalHeight,
      fontEmbedCSS: fontCss,
    });
    return { dataUrl, width: EXACT_WIDTH_PX, height: finalHeight };
  } catch {
    return null;
  } finally {
    host.remove();
  }
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("image load failed"));
    img.src = src;
  });
}

type PageImage = { dataUrl: string; width: number; height: number };

/**
 * Split the tall natural-height render into one A4 page per 1123 CSS px
 * (2246 device px at 2x). Breaking prefers a blank row near each boundary so
 * text lines aren't cut in half. The last page is padded to a full A4.
 */
async function sliceIntoPages(
  dataUrl: string,
  cssWidth: number,
  cssHeight: number,
): Promise<PageImage[]> {
  const img = await loadImage(dataUrl);
  const scale = img.naturalWidth / cssWidth || 1;
  const pageH = Math.round(EXACT_HEIGHT_PX * scale);
  const full = Math.round(cssHeight * scale);
  // A few px over A4 (e.g. 1132 vs 1123) is just trailing whitespace — keep it a
  // single page and crop the sliver, instead of emitting a near-empty page 2.
  const tol = Math.round(20 * scale);
  if (full <= pageH + tol) {
    // Single page: pad to exact A4 so the PDF/Word page is uniform.
    const c = document.createElement("canvas");
    c.width = img.naturalWidth;
    c.height = pageH;
    const ctx = c.getContext("2d");
    if (!ctx) return [{ dataUrl, width: cssWidth, height: EXACT_HEIGHT_PX }];
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, c.width, c.height);
    ctx.drawImage(img, 0, 0);
    return [{ dataUrl: c.toDataURL("image/png"), width: cssWidth, height: EXACT_HEIGHT_PX }];
  }
  const src = document.createElement("canvas");
  src.width = img.naturalWidth;
  src.height = full;
  const sctx = src.getContext("2d");
  if (!sctx) return [{ dataUrl, width: cssWidth, height: cssHeight }];
  sctx.drawImage(img, 0, 0);
  const data = sctx.getImageData(0, 0, src.width, full).data;
  const rowBlank = (yy: number) => {
    for (let x = 0; x < src.width; x += 3) {
      const i = (yy * src.width + x) * 4;
      if (data[i] < 245 || data[i + 1] < 245 || data[i + 2] < 245) return false;
    }
    return true;
  };
  const pages: PageImage[] = [];
  let y = 0;
  while (y < full) {
    let y2 = Math.min(y + pageH, full);
    if (y2 < full) {
      // Snap the break to a nearby blank row (search up to ~40 CSS px).
      const range = Math.round(40 * scale);
      for (let d = 0; d <= range; d += 1) {
        if (y2 - d > y + Math.round(200 * scale) && rowBlank(y2 - d)) {
          y2 -= d;
          break;
        }
        if (y2 + d < full && rowBlank(y2 + d)) {
          y2 += d;
          break;
        }
      }
    }
    const c = document.createElement("canvas");
    c.width = src.width;
    c.height = pageH;
    const ctx = c.getContext("2d");
    if (ctx) {
      ctx.fillStyle = "#fff";
      ctx.fillRect(0, 0, c.width, pageH);
      ctx.drawImage(src, 0, y, src.width, y2 - y, 0, 0, src.width, y2 - y);
      pages.push({ dataUrl: c.toDataURL("image/png"), width: cssWidth, height: EXACT_HEIGHT_PX });
    }
    y = y2;
  }
  return pages;
}

async function renderExactPages(
  doc: ResumeDoc,
  onProgress?: ExportProgress,
): Promise<PageImage[] | null> {
  const result = await renderExactPng(doc, onProgress);
  if (!result) return null;
  onProgress?.("正在按 A4 分页…");
  return sliceIntoPages(result.dataUrl, result.width, result.height);
}

function dataUrlToBytes(dataUrl: string): Uint8Array {
  const base64 = dataUrl.split(",")[1] ?? "";
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

export async function exportExactPng(
  doc: ResumeDoc,
  title: string,
  suffix = "",
  onProgress?: ExportProgress,
): Promise<boolean> {
  onProgress?.("正在生成页面…");
  const pages = await renderExactPages(doc, onProgress);
  if (!pages || pages.length === 0) return false;
  for (let i = 0; i < pages.length; i += 1) {
    onProgress?.(
      pages.length > 1 ? `正在下载第 ${i + 1}/${pages.length} 页…` : "正在下载图片…",
    );
    const response = await fetch(pages[i].dataUrl);
    const blob = await response.blob();
    const pageTag = pages.length > 1 ? `-p${i + 1}` : "";
    downloadBlob(blob, `${safeFileName(title)}${suffix}${pageTag}-${todayStamp()}.png`);
    if (i < pages.length - 1) await new Promise((r) => setTimeout(r, 150));
  }
  return true;
}

export async function exportExactPdf(
  doc: ResumeDoc,
  title: string,
  onProgress?: ExportProgress,
): Promise<boolean> {
  onProgress?.("正在生成页面…");
  const pages = await renderExactPages(doc, onProgress);
  if (!pages || pages.length === 0) return false;
  onProgress?.("正在封装 PDF…");
  const { PDFDocument } = await import("pdf-lib");
  const pdf = await PDFDocument.create();
  const widthPt = EXACT_WIDTH_PX * 0.75; // 595.5pt (A4 width)
  const heightPt = EXACT_HEIGHT_PX * 0.75; // 842.25pt (A4 height)
  for (const page of pages) {
    const image = await pdf.embedPng(dataUrlToBytes(page.dataUrl));
    const p = pdf.addPage([widthPt, heightPt]);
    p.drawImage(image, { x: 0, y: 0, width: widthPt, height: heightPt });
  }
  const output = await pdf.save();
  downloadBlob(
    new Blob([output as BlobPart], { type: "application/pdf" }),
    `${safeFileName(title)}-${todayStamp()}.pdf`,
  );
  return true;
}

/**
 * Text-based PDF (real, selectable text) rendered by the server browser's native
 * print pipeline. Falls back to the image PDF if the server renderer is absent.
 */
export async function exportExactPdfText(
  doc: ResumeDoc,
  title: string,
  onProgress?: ExportProgress,
): Promise<boolean> {
  try {
    onProgress?.("服务端正在生成文字版 PDF…");
    const res = await fetch("/api/export-pdf", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ doc }),
    });
    if (res.ok) {
      noteWatermark(res);
      onProgress?.("正在下载 PDF…");
      const blob = await res.blob();
      downloadBlob(blob, `${safeFileName(title)}-文字版-${todayStamp()}.pdf`);
      return true;
    }
  } catch {
    /* fall through */
  }
  // Fallback: image PDF so the user still gets a file.
  return exportExactPdf(doc, title, onProgress);
}

export async function exportExactWord(
  doc: ResumeDoc,
  title: string,
  onProgress?: ExportProgress,
): Promise<boolean> {
  onProgress?.("正在生成页面…");
  const pages = await renderExactPages(doc, onProgress);
  if (!pages || pages.length === 0) return false;
  onProgress?.("正在封装 Word…");

  // A4 page sized to the image (1 CSS px = 15 twips at 96dpi), ~2px slack.
  const widthTwips = Math.round(EXACT_WIDTH_PX * 15);
  const heightTwips = Math.round(EXACT_HEIGHT_PX * 15) + 30;

  const { Document, ImageRun, Packer, Paragraph, PageBreak } = await import("docx");
  const children: InstanceType<typeof Paragraph>[] = [];
  pages.forEach((page, index) => {
    children.push(
      new Paragraph({
        spacing: { before: 0, after: 0, line: 240 },
        children: [
          new ImageRun({
            type: "png",
            data: dataUrlToBytes(page.dataUrl),
            transformation: { width: EXACT_WIDTH_PX, height: EXACT_HEIGHT_PX },
          }),
        ],
      }),
    );
    if (index < pages.length - 1) {
      children.push(new Paragraph({ children: [new PageBreak()] }));
    }
  });

  const document = new Document({
    sections: [
      {
        properties: {
          page: {
            size: { width: widthTwips, height: heightTwips },
            margin: { top: 0, right: 0, bottom: 0, left: 0 },
          },
        },
        children,
      },
    ],
  });
  const blob = await Packer.toBlob(document);
  downloadBlob(blob, `${safeFileName(title)}-${todayStamp()}.docx`);
  return true;
}

export async function printExactTemplate(doc: ResumeDoc): Promise<boolean> {
  const pages = await renderExactPages(doc);
  if (!pages || pages.length === 0) return false;
  const win = window.open("", "_blank", "width=900,height=1200");
  if (!win) return false;
  win.document.open();
  const imgs = pages
    .map(
      (page, i) =>
        `<img src="${page.dataUrl}" style="width:794px;height:1123px;display:block;${i < pages.length - 1 ? "page-break-after:always;" : ""}" />`,
    )
    .join("");
  win.document.write(
    `<!doctype html><meta charset="utf-8"><title>${safeFileName(doc.title)}</title>` +
      `<style>html,body{margin:0;padding:0}@page{size:A4;margin:0}img{break-after:page}</style>` +
      imgs,
  );
  win.document.close();
  const print = () => {
    try {
      win.focus();
      win.print();
    } catch {
      /* user can retry */
    }
  };
  if (win.document.readyState === "complete") window.setTimeout(print, 500);
  else win.addEventListener("load", () => window.setTimeout(print, 500), { once: true });
  return true;
}

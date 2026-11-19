import type { Page } from "puppeteer-core";

export const WATERMARK_TEXT = "BlazeCV 免费版 · 开通会员去水印";

/**
 * Inject a full-height, tiled watermark into the exact-template iframe before
 * screenshot/print. Absolute positioning keeps it out of layout, so A4 slicing
 * and pagination are unchanged. Returns false when the iframe isn't ready.
 */
export async function injectWatermark(
  page: Page,
  text: string = WATERMARK_TEXT,
): Promise<boolean> {
  try {
    const applied = await page.evaluate((label: string) => {
      const frame = document.querySelector(
        'iframe[title="原站模板 1:1 预览"]',
      ) as HTMLIFrameElement | null;
      const doc = frame?.contentDocument;
      if (!doc) return false;

      const root =
        doc.querySelector<HTMLElement>("#cv-container") ??
        doc.querySelector<HTMLElement>(".main");
      if (!root) return false;
      if (doc.getElementById("__blazecv_watermark")) return true;

      const escapeXml = (value: string) =>
        value
          .replace(/&/g, "&amp;")
          .replace(/</g, "&lt;")
          .replace(/>/g, "&gt;")
          .replace(/"/g, "&quot;");

      const width = Math.max(root.scrollWidth, root.offsetWidth, 794);
      const height = Math.max(root.scrollHeight, root.offsetHeight);
      const svg =
        `<svg xmlns="http://www.w3.org/2000/svg" width="380" height="240">` +
        `<text x="190" y="120" text-anchor="middle" transform="rotate(-30 190 120)" ` +
        `font-family="Arial,Helvetica,sans-serif" font-size="17" fill="#0f172a">` +
        `${escapeXml(label)}</text></svg>`;

      const overlay = doc.createElement("div");
      overlay.id = "__blazecv_watermark";
      overlay.setAttribute("aria-hidden", "true");
      overlay.style.cssText = [
        "position:absolute",
        "left:0",
        "top:0",
        `width:${width}px`,
        `height:${height}px`,
        "pointer-events:none",
        "z-index:2147483647",
        "opacity:0.10",
        "-webkit-print-color-adjust:exact",
        "print-color-adjust:exact",
        `background-image:url("data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}")`,
        "background-repeat:repeat",
      ].join(";");

      const position = doc.defaultView?.getComputedStyle(root).position;
      if (position === "static") root.style.position = "relative";
      root.appendChild(overlay);
      return true;
    }, text);
    return Boolean(applied);
  } catch {
    return false;
  }
}

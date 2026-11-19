export const WATERMARK_TEXT = "BlazeCV 免费版 · 开通会员去水印";

function watermarkUrl(text: string): string {
  const escaped = text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="380" height="240">` +
    `<text x="190" y="120" text-anchor="middle" transform="rotate(-30 190 120)" ` +
    `font-family="Arial,Helvetica,sans-serif" font-size="17" fill="#0f172a">${escaped}</text></svg>`;
  return `url("data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}")`;
}

/**
 * Best-effort overlay for client-only export paths (classic templates rendered
 * with html-to-image). Server-rendered exports are authoritative.
 */
export function createWatermarkOverlay(
  target: HTMLElement,
  text: string = WATERMARK_TEXT,
): () => void {
  const previousPosition = target.style.position;
  if (getComputedStyle(target).position === "static") {
    target.style.position = "relative";
  }

  const overlay = document.createElement("div");
  overlay.setAttribute("data-blazecv-watermark", "1");
  overlay.setAttribute("aria-hidden", "true");
  overlay.style.cssText = [
    "position:absolute",
    "inset:0",
    "pointer-events:none",
    "z-index:2147483647",
    "opacity:0.10",
    "-webkit-print-color-adjust:exact",
    "print-color-adjust:exact",
    `background-image:${watermarkUrl(text)}`,
    "background-repeat:repeat",
  ].join(";");
  target.appendChild(overlay);

  return () => {
    overlay.remove();
    target.style.position = previousPosition;
  };
}

/** Fixed overlay that only appears when printing (classic browser print path). */
export function ensurePrintWatermark(text: string = WATERMARK_TEXT): () => void {
  const id = "__blazecv_print_watermark";
  if (document.getElementById(id)) return () => undefined;

  const style = document.createElement("style");
  style.id = `${id}_style`;
  style.textContent = `@media print { #${id} { display:block !important } }`;

  const overlay = document.createElement("div");
  overlay.id = id;
  overlay.setAttribute("aria-hidden", "true");
  overlay.style.cssText = [
    "display:none",
    "position:fixed",
    "inset:0",
    "pointer-events:none",
    "z-index:2147483647",
    "opacity:0.10",
    "-webkit-print-color-adjust:exact",
    "print-color-adjust:exact",
    `background-image:${watermarkUrl(text)}`,
    "background-repeat:repeat",
  ].join(";");

  document.head.appendChild(style);
  document.body.appendChild(overlay);

  return () => {
    overlay.remove();
    style.remove();
  };
}

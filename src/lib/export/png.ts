import { downloadBlob, safeFileName, todayStamp } from "../utils";
import { createWatermarkOverlay } from "../watermark-client";

export async function exportPng(
  node: HTMLElement,
  title: string,
  suffix = "",
  options?: { watermark?: boolean },
): Promise<void> {
  const cleanup = options?.watermark ? createWatermarkOverlay(node) : null;
  try {
    const { toPng } = await import("html-to-image");
    const dataUrl = await toPng(node, {
      pixelRatio: 2,
      backgroundColor: "#ffffff",
      cacheBust: true,
    });
    const response = await fetch(dataUrl);
    const blob = await response.blob();
    downloadBlob(
      blob,
      `${safeFileName(title)}${suffix}-${todayStamp()}.png`,
    );
  } finally {
    cleanup?.();
  }
}

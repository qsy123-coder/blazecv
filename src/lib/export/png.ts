import { downloadBlob, safeFileName, todayStamp } from "../utils";

export async function exportPng(
  node: HTMLElement,
  title: string,
  suffix = "",
): Promise<void> {
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
}

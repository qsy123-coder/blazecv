"use client";

import { watermarkUrl } from "@/lib/watermark-client";

/**
 * Full-bleed, tiled watermark overlay for the editor preview. Purely decorative:
 * absolutely positioned and pointer-transparent, so it never affects A4 slicing,
 * measurement or layout — and the fidelity/acceptance suites (which run with
 * payments disabled) never see it.
 */
export function WatermarkOverlay() {
  return (
    <div
      aria-hidden="true"
      data-blazecv-preview-watermark
      style={{
        position: "absolute",
        inset: 0,
        pointerEvents: "none",
        zIndex: 2147483647,
        opacity: 0.1,
        backgroundImage: watermarkUrl(),
        backgroundRepeat: "repeat",
      }}
    />
  );
}

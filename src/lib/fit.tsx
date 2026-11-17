"use client";

import { createRoot } from "react-dom/client";
import { flushSync } from "react-dom";
import type { FontScale, ResumeDoc, TemplatePreset, Theme } from "./types";
import { ResumePaper } from "@/components/preview/ResumePaper";
import { resolveTokens } from "./templates";
import { A4_HEIGHT_PX } from "./paper";
import { clamp } from "./utils";

export interface FitResult {
  theme: Theme;
  fits: boolean;
}

interface Candidate {
  theme: Theme;
  score: number;
}

const FONT_PENALTY: Record<FontScale, number> = {
  lg: 0,
  md: 5,
  smd: 7.5,
  sm: 10,
  xs: 15,
  custom: 0,
};

const SCALE_VALUES: Array<{ value: FontScale; scale: number }> = [
  { value: "xs", scale: 0.86 },
  { value: "sm", scale: 0.94 },
  { value: "smd", scale: 0.97 },
  { value: "md", scale: 1 },
  { value: "lg", scale: 1.06 },
];

function nearestScale(value: number): FontScale {
  let best: FontScale = "md";
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const item of SCALE_VALUES) {
    const distance = Math.abs(item.scale - value);
    if (distance < bestDistance) {
      best = item.value;
      bestDistance = distance;
    }
  }
  return best;
}

const DENSE_PENALTY = 6;

function uniqueNumbers(values: number[]): number[] {
  return [...new Set(values.map((value) => Math.round(value * 100) / 100))];
}

function buildCandidates(input: Theme): Candidate[] {
  // A custom multiplier is folded into the nearest preset step so the greedy
  // fitter can keep working with discrete, measurable candidates.
  const base: Theme = {
    ...input,
    fontScale:
      input.fontScale === "custom"
        ? nearestScale(input.customFontScale ?? 1)
        : input.fontScale,
    customFontScale: undefined,
  };
  const lineOptions = uniqueNumbers(
    [base.lineHeight, 1.55, 1.5, 1.45, 1.4, 1.35, 1.3, 1.25, 1.2].filter(
      (value) => value <= base.lineHeight + 0.001,
    ),
  ).sort((a, b) => b - a);
  const marginOptions = uniqueNumbers(
    [base.margin, 16, 14, 12, 10, 8, 6].filter(
      (value) => value <= base.margin,
    ),
  ).sort((a, b) => b - a);
  const scaleOptions: FontScale[] =
    base.fontScale === "lg"
      ? ["lg", "md", "smd", "sm", "xs"]
      : base.fontScale === "md"
        ? ["md", "smd", "sm", "xs"]
        : base.fontScale === "smd"
          ? ["smd", "sm", "xs"]
          : base.fontScale === "sm"
            ? ["sm", "xs"]
            : ["xs"];

  const candidates: Candidate[] = [];
  const seen = new Set<string>();
  for (const dense of [false, true]) {
    for (const fontScale of scaleOptions) {
      for (const lineHeight of lineOptions) {
        for (const margin of marginOptions) {
          const key = `${dense}|${fontScale}|${lineHeight}|${margin}`;
          if (seen.has(key)) continue;
          seen.add(key);
          const score =
            (base.margin - margin) * 1.2 +
            (base.lineHeight - lineHeight) * 25 +
            (FONT_PENALTY[fontScale] - FONT_PENALTY[base.fontScale]) +
            (dense ? DENSE_PENALTY : 0);
          candidates.push({
            theme: {
              ...base,
              fontScale,
              lineHeight,
              margin,
              dense: dense || undefined,
            },
            score,
          });
        }
      }
    }
  }
  candidates.sort((a, b) => a.score - b.score);
  return candidates;
}

export async function fitThemeToOnePage(
  doc: ResumeDoc,
  preset: TemplatePreset,
): Promise<FitResult> {
  const base: Theme = {
    ...doc.theme,
    lineHeight: clamp(doc.theme.lineHeight, 1.2, 1.8),
    margin: clamp(doc.theme.margin, 6, 22),
    dense: undefined,
    fitScale: undefined,
  };
  const candidates = buildCandidates(base);
  const mostCompressed = candidates[candidates.length - 1]?.theme ?? base;

  const host = document.createElement("div");
  host.style.cssText =
    "position:fixed;left:-10000px;top:0;width:210mm;visibility:hidden;pointer-events:none;";
  document.body.appendChild(host);
  const root = createRoot(host);

  const measure = (theme: Theme): number => {
    flushSync(() => {
      root.render(
        <ResumePaper
          doc={{ ...doc, theme }}
          tokens={resolveTokens(preset, theme)}
        />,
      );
    });
    return host.scrollHeight;
  };

  try {
    for (const candidate of candidates) {
      if (measure(candidate.theme) <= A4_HEIGHT_PX + 2) {
        return { theme: candidate.theme, fits: true };
      }
    }

    for (const extra of [0.95, 0.9, 0.85, 0.8, 0.75, 0.7]) {
      const scaled: Theme = { ...mostCompressed, fitScale: extra };
      if (measure(scaled) <= A4_HEIGHT_PX + 2) {
        return { theme: scaled, fits: true };
      }
    }

    return { theme: { ...mostCompressed, fitScale: 0.7 }, fits: false };
  } finally {
    root.unmount();
    host.remove();
  }
}

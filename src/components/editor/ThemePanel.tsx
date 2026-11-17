"use client";

import { useState } from "react";
import { useResumeStore } from "@/store/useResumeStore";
import { getDocTemplate } from "@/lib/templates";
import { EXACT_HEIGHT_PX, getExactTemplateToken } from "@/lib/exact-template";
import { fitThemeToOnePage } from "@/lib/fit";
import { Button } from "@/components/ui";
import { cn } from "@/lib/utils";
import type { FontScale, Theme } from "@/lib/types";

const COLORS = [
  "#111827",
  "#1d4ed8",
  "#0f766e",
  "#7c3aed",
  "#b45309",
  "#be123c",
  "#0f172a",
  "#475569",
];

const SCALES: Array<{ value: FontScale; label: string }> = [
  { value: "xs", label: "特小" },
  { value: "sm", label: "小" },
  { value: "smd", label: "中小" },
  { value: "md", label: "标准" },
  { value: "lg", label: "大" },
  { value: "custom", label: "自定义" },
];

function safeHex(value: string, fallback: string): string {
  return /^#[0-9a-fA-F]{6}$/.test(value) ? value : fallback;
}

export function ThemePanel() {
  const doc = useResumeStore((state) => state.doc);
  const update = useResumeStore((state) => state.update);
  const [fitting, setFitting] = useState(false);
  const [fitMessage, setFitMessage] = useState<string | null>(null);
  if (!doc) return null;

  const preset = getDocTemplate(doc);
  const current = doc.theme.primary || preset.base.primary;
  const exactTemplate = getExactTemplateToken(doc);

  const fitToOnePage = async () => {
    if (fitting) return;
    if (exactTemplate) {
      const target = EXACT_HEIGHT_PX + 20;
      const frame = document.querySelector<HTMLIFrameElement>(
        'iframe[title="原站模板 1:1 预览"]',
      );
      type MeasureApi = (theme: Theme) => Promise<number | null>;
      let measure = (frame?.contentWindow as
        | (Window & { __blazecvMeasureTheme?: MeasureApi })
        | null)?.__blazecvMeasureTheme;

      setFitting(true);
      setFitMessage("正在组合测算字号 / 行距 / 页边距…");
      const previousVisibility = frame?.style.visibility ?? "";
      if (frame) frame.style.visibility = "hidden";
      const started = Date.now();
      try {
        // The preview may still be binding on the first frame.
        for (let i = 0; i < 20 && !measure; i += 1) {
          // eslint-disable-next-line no-await-in-loop
          await new Promise((r) => setTimeout(r, 100));
          measure = (frame?.contentWindow as
            | (Window & { __blazecvMeasureTheme?: MeasureApi })
            | null)?.__blazecvMeasureTheme;
        }
        if (!measure) {
          setFitMessage("预览尚未就绪，请稍后再试。");
          return;
        }
        // The hook exists as soon as the iframe loads; wait for the first bind so
        // the bound-DOM snapshot used by the auto-fit is available.
        let probeHeight: number | null = null;
        for (let i = 0; i < 20; i += 1) {
          // eslint-disable-next-line no-await-in-loop
          probeHeight = await measure(doc.theme);
          if (typeof probeHeight === "number") break;
          // eslint-disable-next-line no-await-in-loop
          await new Promise((r) => setTimeout(r, 100));
        }
        if (typeof probeHeight !== "number") {
          setFitMessage("预览尚未就绪，请稍后再试。");
          return;
        }

        const STEPS: Array<{ value: FontScale; scale: number; label: string }> = [
          { value: "lg", scale: 1.06, label: "大" },
          { value: "md", scale: 1, label: "标准" },
          { value: "smd", scale: 0.97, label: "中小" },
          { value: "sm", scale: 0.94, label: "小" },
          { value: "xs", scale: 0.86, label: "特小" },
        ];
        const round2 = (value: number) => Math.round(value * 100) / 100;
        const base = doc.theme;
        const clampScale = (value: number) => Math.min(1.3, Math.max(0.7, value));
        const currentScale =
          base.fontScale === "custom"
            ? clampScale(base.customFontScale ?? 1)
            : STEPS.find((step) => step.value === base.fontScale)?.scale ?? 1;

        const fontChoices: Array<{
          fontScale: FontScale;
          customFontScale?: number;
          scale: number;
          penalty: number;
          label: string;
        }> = [];
        if (base.fontScale === "custom") {
          fontChoices.push({
            fontScale: "custom",
            customFontScale: currentScale,
            scale: currentScale,
            penalty: 0,
            label: `自定义 ${Math.round(currentScale * 100)}%`,
          });
        } else {
          const currentStep = STEPS.find((step) => step.value === base.fontScale);
          if (currentStep) {
            fontChoices.push({
              fontScale: currentStep.value,
              scale: currentStep.scale,
              penalty: 0,
              label: currentStep.label,
            });
          }
        }
        for (const step of STEPS) {
          if (step.scale >= currentScale - 0.001) continue;
          fontChoices.push({
            fontScale: step.value,
            scale: step.scale,
            penalty: round2((currentScale - step.scale) * 70),
            label: step.label,
          });
        }
        fontChoices.sort((a, b) => b.scale - a.scale);

        // 行距候选：当前值 → 1.00，步长 0.05；超过 8 个时均匀取样。
        const lineValues: number[] = [];
        for (let value = base.lineHeight; value >= 1.0 - 1e-9; value -= 0.05) {
          lineValues.push(round2(Math.max(1.0, value)));
        }
        let lineChoices = [...new Set(lineValues)];
        if (lineChoices.length > 8) {
          const sampled: number[] = [];
          for (let i = 0; i < 8; i += 1) {
            sampled.push(lineChoices[Math.round((i * (lineChoices.length - 1)) / 7)]);
          }
          lineChoices = [...new Set(sampled)].sort((a, b) => b - a);
        }

        // 页边距候选：当前值及向下 1–4mm、8/6/4mm，下限 4mm。
        const marginChoices = [
          ...new Set(
            [base.margin, base.margin - 1, base.margin - 2, base.margin - 3, base.margin - 4, 10, 8, 6, 4]
              .map((value) => Math.round(value))
              .filter((value) => value >= 4 && value <= base.margin),
          ),
        ]
          .sort((a, b) => b - a)
          .slice(0, 8);

        // 组合搜索：按“观感损失”从低到高评估，第一个满足一页的组合就是最优。
        // 损失权重：页边距 < 行距 < 字号（字号最显眼）。
        type Candidate = {
          fontScale: FontScale;
          customFontScale?: number;
          lineHeight: number;
          margin: number;
          cost: number;
          label: string;
        };
        const candidates: Candidate[] = [];
        for (const font of fontChoices) {
          for (const lineHeight of lineChoices) {
            for (const margin of marginChoices) {
              candidates.push({
                fontScale: font.fontScale,
                customFontScale: font.customFontScale,
                lineHeight,
                margin,
                cost:
                  font.penalty +
                  (base.lineHeight - lineHeight) * 25 +
                  // 页边距只影响上下 padding（1mm≈7.6px 总高度）且观感损失最小，
                  // 权重低于字号；需要更多空间时会和字号/行距一起参与组合。
                  (base.margin - margin) * 0.9,
                label: `${font.label} / 行距 ${lineHeight.toFixed(2)} / 页边距 ${margin}mm`,
              });
            }
          }
        }
        candidates.sort((a, b) => a.cost - b.cost);

        const toTheme = (candidate: Candidate): Theme => ({
          ...base,
          fontScale: candidate.fontScale,
          customFontScale: candidate.customFontScale,
          lineHeight: candidate.lineHeight,
          margin: candidate.margin,
          fitScale: undefined,
          dense: undefined,
        });

        let best: Candidate | null = null;
        let bestHeight = 0;
        for (const candidate of candidates) {
          if (Date.now() - started > 5000) break;
          // eslint-disable-next-line no-await-in-loop
          const height = await measure(toTheme(candidate));
          if (typeof height !== "number") break;
          if (height <= target) {
            best = candidate;
            bestHeight = height;
            break;
          }
        }

        if (!best) {
          const mostCompressed: Candidate = {
            fontScale: "xs",
            lineHeight: 1,
            margin: 4,
            cost: Number.POSITIVE_INFINITY,
            label: "特小 / 行距 1.00 / 页边距 4mm",
          };
          bestHeight = (await measure(toTheme(mostCompressed))) ?? bestHeight;
          best = mostCompressed;
        }

        const chosen = best;
        const unchanged =
          chosen.fontScale === base.fontScale &&
          chosen.lineHeight === round2(base.lineHeight) &&
          chosen.margin === Math.round(base.margin);
        update((draft) => {
          draft.theme.fontScale = chosen.fontScale;
          draft.theme.customFontScale = chosen.customFontScale;
          draft.theme.lineHeight = chosen.lineHeight;
          draft.theme.margin = chosen.margin;
          draft.theme.fitScale = undefined;
          draft.theme.dense = undefined;
        });
        setFitMessage(
          bestHeight > target
            ? "已用最小字号/行距/页边距，仍超出（请删减内容）。"
            : unchanged
              ? `内容已在一页内（${chosen.label}）。`
              : `已按观感最优组合适配到一页：${chosen.label}（高度 ${Math.round(bestHeight)}px）。`,
        );
      } finally {
        if (frame) frame.style.visibility = previousVisibility;
        setFitting(false);
      }
      return;
    }
    setFitting(true);
    setFitMessage(null);
    try {
      const result = await fitThemeToOnePage(doc, preset);
      update((draft) => {
        draft.theme = result.theme;
      });
      const extra =
        result.theme.fitScale && result.theme.fitScale < 1
          ? `（额外缩放 ${Math.round(result.theme.fitScale * 100)}%）`
          : "";
      setFitMessage(
        result.fits
          ? `已压缩字号、行距与页边距${extra}，内容位于一页内。`
          : "已使用最小字号/行距/页边距与额外缩放，内容仍超过一页。",
      );
    } finally {
      setFitting(false);
    }
  };

  const setPrimary = (value: string) =>
    update((draft) => {
      draft.theme.primary = value;
    });

  return (
    <div className="space-y-4">
      {exactTemplate ? (
        <p className="rounded-md bg-emerald-50 px-2.5 py-2 text-[10px] leading-relaxed text-emerald-700">
当前为原站 DOM/CSS 1:1 渲染。

「字号 / 行距 / 页边距 / 主色」都会实时作用到右侧原站模板；默认值（标准 / 1.20 / 10mm / 跟随模板）保持与原站 1:1 一致，调整后才相对变化。PDF/PNG/Word 均使用右侧精确渲染。
        </p>
      ) : null}
      <div>
        <span className="field-label">主色</span>
        <div className="flex flex-wrap items-center gap-2">
          {COLORS.map((color) => (
            <button
              key={color}
              type="button"
              aria-label={`主色 ${color}`}
              onClick={() => setPrimary(color)}
              className={cn(
                "h-6 w-6 rounded-full border transition",
                current.toLowerCase() === color.toLowerCase()
                  ? "scale-110 border-slate-900 ring-2 ring-slate-200"
                  : "border-white shadow-sm hover:scale-105",
              )}
              style={{ backgroundColor: color }}
            />
          ))}
          <label className="relative inline-flex h-6 w-6 cursor-pointer items-center justify-center overflow-hidden rounded-full border border-slate-200 bg-gradient-to-br from-rose-400 via-amber-300 to-sky-400 text-[9px] text-white">
            <input
              type="color"
              className="absolute inset-0 cursor-pointer opacity-0"
              value={safeHex(current, "#111827")}
              onChange={(event) => setPrimary(event.target.value)}
            />
            自
          </label>
          <button
            type="button"
            className="text-[11px] text-slate-400 underline-offset-2 hover:text-slate-600 hover:underline"
            onClick={() => setPrimary("")}
          >
            跟随模板
          </button>
        </div>
      </div>

      <div>
        <span className="field-label">字号</span>
        <div className="flex flex-wrap gap-0.5 rounded-md border border-slate-200 bg-slate-50 p-0.5">
          {SCALES.map((item) => (
            <button
              key={item.value}
              type="button"
              onClick={() =>
                update((draft) => {
                  draft.theme.fontScale = item.value;
                  if (
                    item.value === "custom" &&
                    draft.theme.customFontScale === undefined
                  ) {
                    draft.theme.customFontScale = 1;
                  }
                  draft.theme.fitScale = undefined;
                  draft.theme.dense = undefined;
                })
              }
              className={cn(
                "rounded px-2.5 py-1 text-[11px] transition",
                doc.theme.fontScale === item.value
                  ? "bg-white text-slate-900 shadow-sm"
                  : "text-slate-500 hover:text-slate-700",
              )}
            >
              {item.label}
            </button>
          ))}
        </div>
        {doc.theme.fontScale === "custom" ? (
          <div className="mt-2">
            <div className="mb-1 flex items-center justify-between">
              <span className="text-[10px] text-slate-400">自定义字号</span>
              <span className="text-[11px] tabular-nums text-slate-500">
                {Math.round((doc.theme.customFontScale ?? 1) * 100)}%
              </span>
            </div>
            <input
              type="range"
              min={70}
              max={130}
              step={1}
              value={Math.round((doc.theme.customFontScale ?? 1) * 100)}
              className="w-full accent-slate-900"
              aria-label="自定义字号"
              onChange={(event) =>
                update((draft) => {
                  draft.theme.fontScale = "custom";
                  draft.theme.customFontScale = Number(event.target.value) / 100;
                  draft.theme.fitScale = undefined;
                  draft.theme.dense = undefined;
                }, "theme.customFontScale")
              }
            />
          </div>
        ) : null}
      </div>

      <div>
        <div className="mb-1 flex items-center justify-between">
          <span className="field-label mb-0">行距</span>
          <span className="text-[11px] tabular-nums text-slate-500">
            {doc.theme.lineHeight.toFixed(2)}
          </span>
        </div>
        <input
          type="range"
          min={1.0}
          max={1.8}
          step={0.05}
          value={doc.theme.lineHeight}
          className="w-full accent-slate-900"
          onChange={(event) =>
            update((draft) => {
              draft.theme.lineHeight = Number(event.target.value);
              draft.theme.fitScale = undefined;
              draft.theme.dense = undefined;
            }, "theme.lineHeight")
          }
        />
      </div>

      <div>
        <div className="mb-1 flex items-center justify-between">
          <span className="field-label mb-0">页边距</span>
          <span className="text-[11px] tabular-nums text-slate-500">
            {doc.theme.margin}mm
          </span>
        </div>
        <input
          type="range"
          min={4}
          max={22}
          step={1}
          value={doc.theme.margin}
          className="w-full accent-slate-900"
          onChange={(event) =>
            update((draft) => {
              draft.theme.margin = Number(event.target.value);
              draft.theme.fitScale = undefined;
              draft.theme.dense = undefined;
            }, "theme.margin")
          }
        />
      </div>

      <div className="border-t border-slate-100 pt-3">
        <Button
          size="sm"
          className="w-full"
          disabled={fitting}
          onClick={() => void fitToOnePage()}
        >
          {fitting ? "正在测算…" : "自动适配一页"}
        </Button>
        {doc.theme.fitScale && doc.theme.fitScale < 1 ? (
          <p className="mt-1.5 text-[10px] text-amber-600">
            已启用额外缩放 {Math.round(doc.theme.fitScale * 100)}%
          </p>
        ) : null}
        {fitMessage ? (
          <p className="mt-1.5 text-[10px] leading-relaxed text-slate-400">
            {fitMessage}
          </p>
        ) : null}
      </div>
    </div>
  );
}

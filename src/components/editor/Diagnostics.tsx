"use client";

import { useMemo } from "react";
import { useResumeStore } from "@/store/useResumeStore";
import { diagnose, type Severity } from "@/lib/diagnostics";
import { cn } from "@/lib/utils";

const SEVERITY_STYLE: Record<Severity, { dot: string; text: string }> = {
  high: { dot: "bg-rose-500", text: "text-rose-600" },
  medium: { dot: "bg-amber-500", text: "text-amber-600" },
  low: { dot: "bg-slate-400", text: "text-slate-500" },
};

export function Diagnostics() {
  const doc = useResumeStore((state) => state.doc);
  const overflowPx = useResumeStore((state) => state.overflowPx);
  const overflowSection = useResumeStore((state) => state.overflowSection);

  const result = useMemo(
    () => (doc ? diagnose(doc, overflowPx, overflowSection) : null),
    [doc, overflowPx, overflowSection],
  );

  if (!doc || !result) return null;

  const color =
    result.score >= 85 ? "#059669" : result.score >= 70 ? "#d97706" : "#e11d48";
  const visibleIssues = result.issues.slice(0, 6);

  return (
    <div>
      <div className="flex items-center gap-3">
        <div
          className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full"
          style={{
            background: `conic-gradient(${color} ${result.score * 3.6}deg, #e2e8f0 0deg)`,
          }}
        >
          <div
            className="flex h-11 w-11 items-center justify-center rounded-full bg-white text-[15px] font-semibold tabular-nums"
            style={{ color }}
          >
            {result.score}
          </div>
        </div>
        <div className="min-w-0">
          <div className="flex items-baseline gap-2">
            <span className="text-[13px] font-semibold" style={{ color }}>
              {result.grade}
            </span>
            <span className="text-[10px] text-slate-400">
              通过 {result.passed} / {result.total} 项
            </span>
          </div>
          <p className="mt-0.5 text-[11px] leading-relaxed text-slate-400">
            本地规则检查，简历内容不会上传。
          </p>
        </div>
      </div>

      <div className="mt-3 space-y-1.5">
        {visibleIssues.length === 0 ? (
          <div className="rounded-md bg-emerald-50 px-2.5 py-2 text-[11px] text-emerald-700">
            全部检查通过，可以导出投递。
          </div>
        ) : (
          visibleIssues.map((issue) => {
            const style = SEVERITY_STYLE[issue.severity];
            const content = (
              <>
                <span
                  className={cn("mt-1 h-1.5 w-1.5 shrink-0 rounded-full", style.dot)}
                />
                <span className="flex-1 leading-relaxed text-slate-600">
                  {issue.message}
                </span>
                {issue.sectionId ? (
                  <span className="shrink-0 text-[10px] text-slate-300 group-hover:text-slate-500">
                    定位
                  </span>
                ) : null}
              </>
            );

            return issue.sectionId ? (
              <button
                key={issue.id}
                type="button"
                onClick={() =>
                  window.dispatchEvent(
                    new CustomEvent("blazecv:focus-section", {
                      detail: issue.sectionId,
                    }),
                  )
                }
                className="group flex w-full items-start gap-2 rounded px-1 py-1 text-left text-[11px] transition hover:bg-slate-50"
              >
                {content}
              </button>
            ) : (
              <div
                key={issue.id}
                className="flex items-start gap-2 px-1 py-1 text-[11px]"
              >
                {content}
              </div>
            );
          })
        )}
        {result.issues.length > visibleIssues.length ? (
          <p className="px-1 text-[10px] text-slate-400">
            还有 {result.issues.length - visibleIssues.length} 条建议，修正后会自动刷新。
          </p>
        ) : null}
      </div>
    </div>
  );
}

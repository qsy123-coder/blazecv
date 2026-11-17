"use client";

import { useEffect, useState } from "react";
import { useResumeStore } from "@/store/useResumeStore";
import {
  addVersion,
  deleteVersion,
  listVersions,
  type ResumeVersion,
} from "@/lib/storage";
import { Button } from "@/components/ui";
import { Icon } from "@/components/icons";

function formatTime(timestamp: number): string {
  return new Date(timestamp).toLocaleString("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function VersionHistory({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const doc = useResumeStore((state) => state.doc);
  const reset = useResumeStore((state) => state.reset);
  const [versions, setVersions] = useState<ResumeVersion[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const refresh = async () => {
    if (!doc) return;
    setVersions(await listVersions(doc.id));
  };

  useEffect(() => {
    if (!open || !doc) return;
    let cancelled = false;
    void listVersions(doc.id).then((items) => {
      if (!cancelled) setVersions(items);
    });
    return () => {
      cancelled = true;
    };
  }, [open, doc?.id]);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open || !doc) return null;

  const saveNow = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await addVersion(doc);
      await refresh();
      setMessage("已保存当前版本");
    } finally {
      setBusy(false);
    }
  };

  const restore = async (version: ResumeVersion) => {
    if (busy) return;
    if (!window.confirm("恢复该版本会覆盖当前编辑内容，继续？")) return;
    setBusy(true);
    try {
      const restored = structuredClone(version.doc);
      restored.id = doc.id;
      restored.updatedAt = Date.now();
      reset(restored);
      await refresh();
      setMessage(`已恢复到 ${formatTime(version.savedAt)} 的版本`);
    } finally {
      setBusy(false);
    }
  };

  const remove = async (version: ResumeVersion) => {
    if (busy || typeof version.id !== "number") return;
    if (!window.confirm("删除这条历史版本？")) return;
    setBusy(true);
    try {
      await deleteVersion(version.id);
      await refresh();
      setMessage("历史版本已删除");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/45 p-6 backdrop-blur-[2px]"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-md rounded-xl bg-white p-5 shadow-2xl">
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-[15px] font-semibold text-slate-900">历史版本</h2>
            <p className="mt-0.5 text-[11px] text-slate-400">
              「{doc.title}」· 每 10 分钟自动保留一次，最多 20 个版本。
            </p>
          </div>
          <button
            type="button"
            aria-label="关闭"
            onClick={onClose}
            className="rounded-md p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
          >
            <Icon name="x" size={18} />
          </button>
        </div>

        <div className="mt-4 flex items-center gap-2">
          <Button variant="primary" size="sm" disabled={busy} onClick={() => void saveNow()}>
            保存当前版本
          </Button>
          {message ? (
            <span className="text-[10px] text-emerald-600">{message}</span>
          ) : null}
        </div>

        <div className="mt-3 max-h-[45vh] space-y-1.5 overflow-y-auto pr-1">
          {versions.length === 0 ? (
            <p className="rounded bg-slate-50 px-3 py-4 text-center text-[11px] text-slate-400">
              还没有历史版本。编辑后会自动保留，也可以手动保存。
            </p>
          ) : (
            versions.map((version) => (
              <div
                key={version.id}
                className="flex items-center justify-between gap-2 rounded-md border border-slate-200 px-2.5 py-2"
              >
                <div className="min-w-0">
                  <div className="truncate text-[11px] font-medium text-slate-700">
                    {formatTime(version.savedAt)}
                  </div>
                  <div className="truncate text-[10px] text-slate-400">
                    {version.title}
                  </div>
                </div>
                <div className="flex shrink-0 gap-1">
                  <button
                    type="button"
                    onClick={() => void restore(version)}
                    className="rounded px-1.5 py-0.5 text-[10px] text-slate-500 transition hover:bg-slate-100"
                  >
                    恢复
                  </button>
                  <button
                    type="button"
                    onClick={() => void remove(version)}
                    className="rounded px-1.5 py-0.5 text-[10px] text-slate-400 transition hover:bg-rose-50 hover:text-rose-500"
                  >
                    删除
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

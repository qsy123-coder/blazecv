"use client";

import Link from "next/link";
import { useState } from "react";
import type { ResumeDoc } from "@/lib/types";
import { parseResumeObject } from "@/lib/schema";
import { getTemplate, resolveTokens } from "@/lib/templates";
import { ShareView } from "./ShareView";
import { Button, Field, TextInput } from "@/components/ui";
import { Icon } from "@/components/icons";

export function ShareGate({ token }: { token: string }) {
  const [password, setPassword] = useState("");
  const [doc, setDoc] = useState<ResumeDoc | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const unlock = async () => {
    if (!password || busy) return;
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`/api/public/share/${token}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      const data = (await response.json().catch(() => ({}))) as {
        error?: string;
        doc?: unknown;
      };
      if (!response.ok) {
        setError(data.error || "无法查看这份简历");
        return;
      }
      const parsed = parseResumeObject(data.doc);
      if (!parsed.ok) {
        setError("简历数据无效");
        return;
      }
      setDoc(parsed.doc);
    } catch {
      setError("网络错误，请稍后再试");
    } finally {
      setBusy(false);
    }
  };

  if (doc) {
    const tokens = resolveTokens(getTemplate(doc.templateId), doc.theme);
    return <ShareView doc={doc} tokens={tokens} />;
  }

  return (
    <div className="flex min-h-screen flex-col bg-slate-100">
      <header className="border-b border-slate-200 bg-white/90">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4">
          <Link href="/" className="flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-md bg-slate-900 text-[13px] font-bold text-white">
              B
            </div>
            <span className="text-[15px] font-semibold tracking-tight">BlazeCV</span>
          </Link>
          <span className="text-[11px] text-slate-400">只读分享</span>
        </div>
      </header>

      <main className="flex flex-1 items-center justify-center px-4 py-10">
        <div className="w-full max-w-sm rounded-xl border border-slate-200 bg-white p-5 shadow-xl">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-900 text-white">
            <Icon name="lock" size={18} />
          </div>
          <h1 className="mt-3 text-[16px] font-semibold text-slate-900">
            此分享受密码保护
          </h1>
          <p className="mt-1 text-[11px] leading-relaxed text-slate-500">
            输入作者设置的访问密码查看简历。
          </p>

          <div className="mt-4 space-y-3">
            <Field label="访问密码">
              <TextInput
                type="password"
                value={password}
                autoComplete="off"
                placeholder="请输入密码"
                onChange={(event) => setPassword(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") void unlock();
                }}
              />
            </Field>
            {error ? (
              <p className="rounded bg-rose-50 px-2.5 py-1.5 text-[11px] text-rose-600">
                {error}
              </p>
            ) : null}
            <Button
              variant="primary"
              className="w-full"
              disabled={busy || password.length === 0}
              onClick={() => void unlock()}
            >
              {busy ? "验证中…" : "查看简历"}
            </Button>
          </div>
        </div>
      </main>

      <footer className="border-t border-slate-200 bg-white px-4 py-3 text-center text-[10px] text-slate-400">
        由 BlazeCV 生成 · 只读分享
      </footer>
    </div>
  );
}

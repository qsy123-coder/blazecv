"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { CatalogTemplate } from "@/lib/catalog";
import { presetFromCatalog } from "@/lib/catalog";
import { buildTemplateSample, loadTemplateContent } from "@/lib/template-sample";
import { saveResume } from "@/lib/storage";
import { uid } from "@/lib/utils";
import { Icon } from "@/components/icons";

export function UseCatalogTemplate({ entry }: { entry: CatalogTemplate }) {
  const router = useRouter();
  const [creating, setCreating] = useState(false);

  const useTemplate = async () => {
    if (creating) return;
    setCreating(true);
    try {
      const preset = presetFromCatalog(entry);
      const content = await loadTemplateContent(entry.sourceToken || entry.token);
      const doc = buildTemplateSample(preset, content);
      doc.id = uid("resume");
      doc.title = "未命名简历";
      doc.updatedAt = Date.now();
      await saveResume(doc);
      router.push(`/editor?id=${encodeURIComponent(doc.id)}`);
    } catch {
      window.alert("创建简历失败，请检查浏览器存储权限。");
      setCreating(false);
    }
  };

  return (
    <button
      type="button"
      onClick={() => void useTemplate()}
      disabled={creating}
      className="inline-flex h-11 items-center gap-2 rounded-md bg-slate-900 px-5 text-[14px] font-medium text-white transition hover:bg-slate-800 disabled:cursor-wait disabled:opacity-60"
    >
      {creating ? "正在创建…" : "使用此模板"}
      <Icon name="arrowRight" size={15} />
    </button>
  );
}

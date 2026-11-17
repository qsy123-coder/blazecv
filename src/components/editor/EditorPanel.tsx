"use client";

import { useEffect, useRef, useState } from "react";
import { Card } from "@/components/ui";
import { BasicsForm } from "./BasicsForm";
import { ThemePanel } from "./ThemePanel";
import { SectionsEditor } from "./SectionsEditor";
import { Diagnostics } from "./Diagnostics";
import { cn } from "@/lib/utils";

const TABS = [
  { id: "basics", label: "基本信息" },
  { id: "diagnostics", label: "内容检查" },
  { id: "theme", label: "排版与主题" },
  { id: "sections", label: "模块内容" },
] as const;

type TabId = (typeof TABS)[number]["id"];

export function EditorPanel({ width }: { width?: number | null }) {
  const asideRef = useRef<HTMLElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const suppressSyncRef = useRef(0);
  const [narrow, setNarrow] = useState(false);
  const [active, setActive] = useState<TabId>("basics");

  // 拖到最左侧（单列，<480px）时显示板块 Tab，点击直接定位，免去上下滚动。
  useEffect(() => {
    const element = asideRef.current;
    if (!element) return;
    const observer = new ResizeObserver((entries) => {
      const panelWidth = entries[0]?.contentRect.width ?? element.clientWidth;
      setNarrow(panelWidth < 480);
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  // 滚动时同步高亮当前板块（监听内部滚动容器，头部固定不动）。
  useEffect(() => {
    if (!narrow) return;
    const element = scrollRef.current;
    if (!element) return;
    let frame = 0;
    const sync = () => {
      if (frame) return;
      frame = window.requestAnimationFrame(() => {
        frame = 0;
        // 点击 Tab 触发的平滑滚动期间不要用中间位置覆盖高亮。
        if (performance.now() < suppressSyncRef.current) return;
        const top = element.getBoundingClientRect().top;
        const atBottom =
          element.scrollTop + element.clientHeight >= element.scrollHeight - 2;
        if (atBottom) {
          setActive(TABS[TABS.length - 1].id);
          return;
        }
        const threshold = top + 40;
        let current: TabId = TABS[0].id;
        for (const tab of TABS) {
          const node = element.querySelector<HTMLElement>(`#editor-card-${tab.id}`);
          if (node && node.getBoundingClientRect().top <= threshold) current = tab.id;
        }
        setActive(current);
      });
    };
    element.addEventListener("scroll", sync, { passive: true });
    sync();
    return () => {
      element.removeEventListener("scroll", sync);
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, [narrow]);

  const jumpTo = (id: TabId) => {
    setActive(id);
    suppressSyncRef.current = performance.now() + 800;
    scrollRef.current
      ?.querySelector<HTMLElement>(`#editor-card-${id}`)
      ?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    // Default width comes from .editor-panel in globals.css; dragging the
    // splitter passes an explicit px width. Card columns follow the container
    // width (container queries), so the split can be tuned freely.
    <aside
      ref={asideRef}
      className="editor-panel hidden shrink-0 flex-col overflow-hidden border-r border-slate-200 bg-[#f8f9fb] md:flex"
      style={width != null ? { width: `${width}px`, flexBasis: `${width}px` } : undefined}
    >
      {/*
        头部（标题 + 窄栏 Tab）放在滚动容器之外：固定占满整个左栏宽度，
        滚动条只出现在下方卡片区域，不会在头部右侧留下未填充的空隙。
      */}
      <div className="z-20 shrink-0 border-b border-slate-200 bg-white/95 backdrop-blur">
        <div className="flex h-10 items-center justify-between px-4">
          <span className="text-[12px] font-semibold text-slate-600">简历内容</span>
          <span className="text-[10px] text-slate-400">修改后自动保存</span>
        </div>
        {narrow ? (
          <div className="px-2 pb-1.5">
            <div className="flex items-center gap-0.5 rounded-lg bg-slate-100 p-0.5">
              {TABS.map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => jumpTo(tab.id)}
                  aria-pressed={active === tab.id}
                  className={cn(
                    "min-w-0 flex-1 truncate rounded px-1 py-1 text-[10px] font-medium outline-none transition focus-visible:ring-2 focus-visible:ring-blue-400",
                    active === tab.id
                      ? "bg-white text-slate-900 shadow-sm"
                      : "text-slate-500 hover:text-slate-700",
                  )}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>
        ) : null}
      </div>

      <div
        ref={scrollRef}
        data-editor-scroll
        className="thin-scroll min-h-0 flex-1 overflow-y-auto"
      >
        <div className="editor-cards p-3">
          <div id="editor-card-basics" className="scroll-mt-3">
            <Card title="基本信息">
              <BasicsForm />
            </Card>
          </div>
          <div id="editor-card-diagnostics" className="scroll-mt-3">
            <Card title="内容检查">
              <Diagnostics />
            </Card>
          </div>
          <div id="editor-card-theme" className="scroll-mt-3">
            <Card title="排版与主题">
              <ThemePanel />
            </Card>
          </div>
          <div id="editor-card-sections" className="scroll-mt-3">
            <Card title="模块内容" bodyClassName="p-2.5">
              <SectionsEditor />
            </Card>
          </div>
          <p className="px-1 pb-2 text-[10px] leading-relaxed text-slate-400">
            所有内容仅保存在当前浏览器，不会上传服务器。换设备前请用「备份 → 导出 JSON」。
          </p>
        </div>
      </div>
    </aside>
  );
}

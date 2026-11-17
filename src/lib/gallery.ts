import type { LayoutKind, TemplateId } from "./types";

export interface TemplateGroup {
  layout: LayoutKind;
  label: string;
  hint: string;
}

export const TEMPLATE_GROUPS: TemplateGroup[] = [
  { layout: "single", label: "单栏", hint: "通用、科研与信息密度优先" },
  { layout: "sidebar", label: "浅色侧栏", hint: "社招、研发与应届" },
  { layout: "timeline", label: "时间轴", hint: "经历连续、项目多" },
  { layout: "banner", label: "通栏横幅", hint: "设计岗、内容岗" },
  { layout: "dark-sidebar", label: "深色侧栏", hint: "技术岗、产品" },
  { layout: "split", label: "居中框线", hint: "通用、左右分栏" },
  { layout: "editorial", label: "编辑标签栏", hint: "学术、品牌与作品型" },
];

export const NEW_TEMPLATE_IDS = new Set<TemplateId>([
  "banner-emerald",
  "banner-ink",
  "dark-slate",
  "split-classic",
  "editorial-serif",
  "editorial-blue",
]);

export const POPULAR_TEMPLATE_IDS = new Set<TemplateId>(["minimal", "business"]);

export function layoutLabel(layout: LayoutKind): string {
  return TEMPLATE_GROUPS.find((group) => group.layout === layout)?.label ?? "模板";
}

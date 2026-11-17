import type { Metadata } from "next";
import { TemplateCatalog } from "@/components/templates/TemplateCatalog";

export const metadata: Metadata = {
  title: "模板库 · BlazeCV",
  description: "全部采集模板：原预览图、用途筛选与可编辑版式。",
};

export default function TemplatesPage() {
  return <TemplateCatalog />;
}

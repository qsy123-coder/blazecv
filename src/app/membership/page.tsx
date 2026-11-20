import type { Metadata } from "next";
import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";
import { MembershipCenter } from "@/components/membership/MembershipCenter";
import { pageAlternates } from "@/lib/seo";

export const metadata: Metadata = {
  title: "会员",
  description:
    "BlazeCV 会员：导出 PDF / PNG / Word 不带水印，会员期内不限次数；月卡 ¥9.9，年卡 ¥68，到期不自动续费。编辑与预览始终免费。",
  alternates: pageAlternates("/membership"),
};

export default function MembershipPage() {
  return (
    <div className="min-h-screen bg-slate-50">
      <SiteHeader />
      <MembershipCenter />
      <SiteFooter />
    </div>
  );
}

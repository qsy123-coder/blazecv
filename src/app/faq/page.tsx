import type { Metadata } from "next";
import Link from "next/link";
import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";
import { OG_IMAGE, SITE_NAME, pageAlternates } from "@/lib/seo";

const TITLE = "简历模板常见问题 FAQ";
const DESC =
  "BlazeCV 简历模板常见问题：模板是否免费、如何导出 PDF/PNG/Word、简历数据保存在哪里、A4 分页与自动适配、如何切换模板、支持哪些设备和浏览器。";

export const metadata: Metadata = {
  title: TITLE,
  description: DESC,
  alternates: pageAlternates("/faq"),
  keywords: ["简历模板常见问题", "简历模板免费吗", "简历导出PDF", "简历A4分页", "在线简历工具"],
  openGraph: {
    type: "website",
    locale: "zh_CN",
    siteName: SITE_NAME,
    title: TITLE,
    description: DESC,
    url: "/faq",
    images: [OG_IMAGE],
  },
  twitter: {
    card: "summary_large_image",
    title: TITLE,
    description: DESC,
    images: [OG_IMAGE.url],
  },
};

const FAQS = [
  {
    q: "BlazeCV 的简历模板是免费的吗？",
    a: "全部 4127 套模板都可以免费浏览、在线编辑和预览。导出 PDF、PNG、Word 也可以免登录完成，但免费版文件带水印；开通会员后导出无水印，会员期内不限次数。云端同步仍需要登录。",
  },
  {
    q: "会员多少钱？和免费版有什么区别？",
    a: "月卡 ¥9.9（30 天）、年卡 ¥68（365 天），到期不自动续费。免费版与会员的编辑、预览功能完全一致；区别只是导出文件是否带水印，会员期内不限导出次数。",
  },
  {
    q: "如何开通会员、支持哪些支付方式？",
    a: "登录后打开「会员」页，选择月卡或年卡，使用微信扫码支付。支付成功后立即生效；续费时长会从当前到期日继续叠加。",
  },
  {
    q: "会员可以退款吗？",
    a: "会员是虚拟商品，支付成功即开通。未使用无水印导出且支付后 7 天内，可联系客服原路退款；已使用无水印导出后不支持退款。",
  },
  {
    q: "如何把简历导出成 PDF、PNG 或 Word？",
    a: "在编辑器右上角点击「导出」，可以选择 PDF（图片版或可编辑文字版）、PNG 图片和 Word。图片版使用服务端原生浏览器渲染，视觉与右侧 A4 预览一致；文字版适合需要继续编辑内容的场景。",
  },
  {
    q: "简历数据会被上传到服务器吗？",
    a: "默认不会。简历保存在浏览器的 IndexedDB 中，换设备前可以通过「备份 → 导出 JSON」迁移。只有你主动使用云端同步或分享链接时，对应内容才会保存到服务器。",
  },
  {
    q: "内容超过一页 A4 怎么办？",
    a: "编辑器会按 A4 高度自动分页，内容超过一页时会另起一页 A4，不会把纸张拉长或压扁。也可以使用「自动适配一页」，通过字号、行距与页边距的组合调整把内容压到一页。",
  },
  {
    q: "可以随时切换模板吗？",
    a: "可以。左侧内容会保留，切换模板后重新绑定到新模板，不需要重新填写。模板选择器同时提供精选模板和完整模板库，并支持搜索、版式与用途筛选。",
  },
  {
    q: "模板的排版和原网站一致吗？",
    a: "BlazeCV 使用抓取的原站模板页面真实 DOM 与 CSS 进行 1:1 渲染，保留原有的字号、行距、页头花纹和模块结构。右侧预览、PNG、PDF 与 Word 图片版共用同一渲染结果。",
  },
  {
    q: "支持手机或平板编辑吗？",
    a: "支持。编辑页针对窄屏做了适配，可查看 A4 预览并使用主要编辑功能；导出完整图片版 PDF/Word 建议在桌面浏览器中完成。",
  },
  {
    q: "没有找到合适的模板怎么办？",
    a: "可以在「全部模板库」中按单栏、侧栏、时间轴、横幅、深色、分栏或编辑标签栏等版式筛选，也可以按应届生、社招、技术、运营、设计等用途筛选，或直接搜索模板名称。",
  },
];

const jsonLd = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: FAQS.map((item) => ({
    "@type": "Question",
    name: item.q,
    acceptedAnswer: { "@type": "Answer", text: item.a },
  })),
};

export default function FaqPage() {
  return (
    <div className="min-h-screen bg-slate-50">
      <SiteHeader />
      <main className="mx-auto w-full max-w-[1000px] px-6 py-10">
        <nav className="flex items-center gap-1.5 text-[11px] text-slate-400">
          <Link href="/" className="hover:text-slate-700">
            首页
          </Link>
          <span>/</span>
          <span className="text-slate-600">常见问题</span>
        </nav>
        <h1 className="mt-4 text-[28px] font-bold tracking-tight text-slate-900">
          简历模板常见问题
        </h1>
        <p className="mt-2 max-w-2xl text-[13px] leading-6 text-slate-500">
          关于 BlazeCV 简历模板、在线编辑、A4 分页与导出的常见问题。若没有找到答案，可以从
          <Link href="/templates" className="mx-1 text-blue-600 hover:underline">
            全部模板库
          </Link>
          开始体验。
        </p>

        <div className="mt-8 space-y-4">
          {FAQS.map((item) => (
            <section
              key={item.q}
              className="rounded-xl border border-slate-200 bg-white p-5"
            >
              <h2 className="text-[15px] font-semibold text-slate-800">{item.q}</h2>
              <p className="mt-2 text-[13px] leading-6 text-slate-500">{item.a}</p>
            </section>
          ))}
        </div>

        <div className="mt-8 flex flex-wrap items-center gap-3">
          <Link
            href="/templates"
            className="inline-flex h-10 items-center rounded-md bg-slate-900 px-4 text-[13px] font-medium text-white transition hover:bg-slate-800"
          >
            浏览全部简历模板
          </Link>
          <Link
            href="/"
            className="text-[12px] text-slate-500 hover:text-slate-800"
          >
            返回首页
          </Link>
        </div>
      </main>

      <SiteFooter />

      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
    </div>
  );
}

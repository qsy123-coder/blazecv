import Link from "next/link";
import { getCatalog } from "@/lib/catalog-server";
import { GUIDES, guideHref } from "@/lib/guides";
import { HOME_FAQ } from "@/lib/home-faq";
import {
  LAYOUT_KEYS,
  LAYOUT_LABELS,
  indexableTags,
  layoutHref,
  tagHref,
  tagStats,
} from "@/lib/seo-collections";
import { SITE_NAME } from "@/lib/seo";

/**
 * Server-rendered SEO section for the home page.
 *
 * The home page itself is a client component whose template grid is fetched at
 * runtime, so crawlers that do not execute JavaScript used to see a hero and
 * nothing else. This block is rendered on the server and injected into the
 * page shell: keyword paragraphs, category links, guide links and a FAQ with
 * matching structured data.
 */

const FALLBACK_TAGS = [
  "应届生",
  "校招",
  "实习",
  "社招",
  "互联网",
  "程序员",
  "产品经理",
  "运营",
  "设计",
  "金融",
  "银行",
  "数据分析",
];

const LAYOUT_BLURB: Record<string, string> = {
  single: "自上而下的阅读顺序，招聘方最熟悉，也最不容易被简历筛选系统解析错。",
  sidebar: "窄侧栏放技能与证书，主栏放经历，适合内容较多的求职者。",
  timeline: "纵向时间线串起教育与工作经历，时间跨度一眼可见。",
  banner: "页首整条色块承载姓名与职位，视觉重心明确。",
  "dark-sidebar": "深色侧栏突出个人信息与技能标签，对比强、辨识度高。",
  split: "左右分栏、信息密度高，适合经历丰富且需要一页呈现的求职者。",
  editorial: "标签式模块标题，接近杂志排版，适合内容与创意类岗位。",
};

export async function HomeSeoContent() {
  const catalog = await getCatalog().catch(() => null);
  const tags = catalog ? indexableTags(catalog, 18) : FALLBACK_TAGS;
  const counts = catalog
    ? new Map(tagStats(catalog).map((row) => [row.tag, row.count]))
    : new Map<string, number>();
  const layouts = LAYOUT_KEYS.map((key) => ({
    key,
    label: LAYOUT_LABELS[key],
    count: catalog
      ? catalog.templates.filter((entry) => entry.layout === key).length
      : 0,
  })).filter((row) => row.count > 0 || !catalog);

  return (
    <section
      aria-labelledby="home-seo-heading"
      className="border-t border-slate-200 bg-white"
    >
      <div className="mx-auto w-full max-w-[1600px] px-6 py-14">
        <h2
          id="home-seo-heading"
          className="text-[24px] font-bold tracking-tight text-slate-900"
        >
          在线简历制作：选模板、填内容、导出 PDF
        </h2>
        <p className="mt-3 max-w-3xl text-[13px] leading-7 text-slate-600">
          BlazeCV 是一个在线简历制作工具与简历模板库：收录 4127 套个人简历模板，
          覆盖应届生、校招、实习、社招、跳槽等求职阶段，以及互联网、金融、银行、
          教育、财务、销售、设计等行业与岗位。选好模板后左侧填写内容，右侧实时显示
          A4 排版，超出自动分页；最后导出 PDF、PNG 或 Word。所有模板都按原站页面的
          真实 DOM 与 CSS 渲染，预览与导出保持一致。
        </p>

        <ol className="mt-6 grid gap-4 sm:grid-cols-3">
          {[
            {
              step: "1",
              title: "挑一套版式合适的模板",
              desc: "按用途（应届生 / 校招 / 社招 / 行业岗位）或版式（单栏 / 侧栏 / 时间轴 / 横幅）筛选，先看 A4 预览再决定。",
            },
            {
              step: "2",
              title: "左侧填写，右侧实时预览",
              desc: "姓名、联系方式、教育、工作、项目、技能逐项绑定到模板槽位，改一个字右侧立刻更新，不需要导出后才能看到效果。",
            },
            {
              step: "3",
              title: "调好一页，再导出投递",
              desc: "用「自动适配一页」把内容压进一张 A4，再导出 PDF 图片版投递，或导出 Word 文字版继续修改。",
            },
          ].map((item) => (
            <li
              key={item.step}
              className="rounded-xl border border-slate-200 bg-slate-50 p-4"
            >
              <div className="flex h-7 w-7 items-center justify-center rounded-md bg-slate-900 text-[12px] font-semibold text-white">
                {item.step}
              </div>
              <h3 className="mt-3 text-[13px] font-semibold text-slate-800">
                {item.title}
              </h3>
              <p className="mt-1.5 text-[11px] leading-5 text-slate-500">
                {item.desc}
              </p>
            </li>
          ))}
        </ol>

        <div className="mt-12 grid gap-10 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
          <div>
            <h3 className="text-[18px] font-semibold tracking-tight text-slate-900">
              按求职用途找简历模板
            </h3>
            <p className="mt-1.5 text-[12px] leading-5 text-slate-500">
              每个分类都整理了该用途下的全部模板、版式与示例内容，点进去可以直接套用。
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              {tags.map((tag) => (
                <Link
                  key={tag}
                  href={tagHref(tag)}
                  className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-[11px] text-slate-600 transition hover:border-blue-300 hover:text-blue-600"
                >
                  {tag}简历模板
                  {counts.get(tag) ? (
                    <span className="ml-1 text-slate-400">{counts.get(tag)}</span>
                  ) : null}
                </Link>
              ))}
              <Link
                href="/templates"
                className="rounded-full border border-slate-900 bg-slate-900 px-3 py-1.5 text-[11px] text-white transition hover:bg-slate-800"
              >
                查看全部 4127 套 →
              </Link>
            </div>
          </div>

          <div>
            <h3 className="text-[18px] font-semibold tracking-tight text-slate-900">
              按版式选择简历模板
            </h3>
            <p className="mt-1.5 text-[12px] leading-5 text-slate-500">
              版式决定招聘方第一眼的阅读顺序，也决定打印与 ATS 解析的稳妥程度。
            </p>
            <ul className="mt-4 space-y-2">
              {layouts.map((row) => (
                <li key={row.key} className="flex gap-2 text-[12px] leading-6">
                  <Link
                    href={layoutHref(row.key)}
                    className="shrink-0 font-medium text-blue-600 hover:underline"
                  >
                    {row.label}简历模板
                  </Link>
                  <span className="text-slate-500">
                    {LAYOUT_BLURB[row.key] ?? ""}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className="mt-12">
          <div className="flex flex-wrap items-end justify-between gap-2">
            <h3 className="text-[18px] font-semibold tracking-tight text-slate-900">
              简历怎么写：按模块拆解的写作指南
            </h3>
            <Link
              href="/guides"
              className="text-[12px] font-medium text-blue-600 transition hover:underline"
            >
              查看全部指南 →
            </Link>
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {GUIDES.slice(0, 6).map((guide) => (
              <Link
                key={guide.slug}
                href={guideHref(guide.slug)}
                className="rounded-xl border border-slate-200 bg-white p-4 transition hover:border-blue-300"
              >
                <h4 className="text-[13px] font-semibold text-slate-800">
                  {guide.title}
                </h4>
                <p className="mt-1 line-clamp-2 text-[11px] leading-5 text-slate-500">
                  {guide.description}
                </p>
              </Link>
            ))}
          </div>
        </div>

        <div className="mt-12">
          <h3 className="text-[18px] font-semibold tracking-tight text-slate-900">
            在线简历制作常见问题
          </h3>
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            {HOME_FAQ.map((item) => (
              <div
                key={item.q}
                className="rounded-xl border border-slate-200 bg-slate-50 p-4"
              >
                <h4 className="text-[13px] font-semibold text-slate-800">
                  {item.q}
                </h4>
                <p className="mt-1.5 text-[11px] leading-5 text-slate-500">
                  {item.a}
                </p>
              </div>
            ))}
          </div>
          <p className="mt-4 text-[11px] text-slate-400">
            还有疑问可以查看
            <Link href="/faq" className="mx-1 text-blue-600 hover:underline">
              {SITE_NAME} 常见问题
            </Link>
            ，或直接打开
            <Link href="/templates" className="mx-1 text-blue-600 hover:underline">
              全部简历模板
            </Link>
            开始制作。
          </p>
        </div>
      </div>
    </section>
  );
}

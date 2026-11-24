/**
 * Site-wide footer link data.
 *
 * Kept deliberately small and dependency-free: the footer is rendered inside
 * client components too (home page / template catalog), so importing the full
 * `guides.ts` corpus here would push every guide body into the client bundle.
 * Only slugs, titles and hrefs belong in this module.
 */

export const FOOTER_TAGS: string[] = [
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
  "教师",
  "财务",
  "销售",
  "人力资源",
  "市场营销",
  "测试",
];

export const FOOTER_LAYOUTS: Array<{ key: string; label: string }> = [
  { key: "single", label: "单栏" },
  { key: "sidebar", label: "侧栏" },
  { key: "timeline", label: "时间轴" },
  { key: "banner", label: "横幅" },
  { key: "dark-sidebar", label: "深色侧栏" },
  { key: "split", label: "分栏" },
  { key: "editorial", label: "编辑标签栏" },
];

export const FOOTER_GUIDES: Array<{ slug: string; title: string }> = [
  { slug: "fresh-graduate-no-internship", title: "应届生没有实习怎么写" },
  { slug: "campus-resume-template-guide", title: "校招简历模板怎么选" },
  { slug: "one-page-or-two-page-resume", title: "一页简历还是两页" },
  { slug: "resume-self-evaluation", title: "简历自我评价怎么写" },
  { slug: "resume-project-experience", title: "项目经历怎么写" },
  { slug: "resume-internship-experience", title: "实习经历怎么写" },
  { slug: "resume-skills-section", title: "简历技能栏怎么写" },
  { slug: "resume-photo-or-not", title: "简历要不要放照片" },
  { slug: "resume-file-naming-and-delivery", title: "简历命名与投递" },
  { slug: "resume-layout-and-typography", title: "简历排版技巧" },
  { slug: "resume-keywords-and-ats", title: "简历关键词怎么写" },
  { slug: "career-change-resume", title: "转行简历怎么写" },
  { slug: "job-change-resume", title: "跳槽简历怎么写" },
  { slug: "resume-employment-gap", title: "简历空窗期怎么写" },
  { slug: "resume-expected-salary", title: "简历要不要写期望薪资" },
];

export function footerTagHref(tag: string): string {
  return `/templates/tag/${encodeURIComponent(tag)}`;
}

export function footerLayoutHref(layout: string): string {
  return `/templates/layout/${encodeURIComponent(layout)}`;
}

export function footerGuideHref(slug: string): string {
  return `/guides/${slug}`;
}

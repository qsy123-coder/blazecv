/**
 * SEO 抓取与索引的 HTTP 级验收：
 * robots / sitemap / RSS / 首页服务端内容 / 结构化数据 / 内链 / IndexNow 密钥。
 *
 * 用法：node scripts/verify-seo.mjs
 * 环境变量：APP_URL（默认 http://127.0.0.1:3000）。
 *
 * 说明：这里只检查服务端直接返回的 HTML（不执行 JS），因为百度、
 * 搜狗等爬虫大多不渲染前端脚本；能在这里看到的内容才等于爬虫能看到的内容。
 */
const BASE = (process.env.APP_URL ?? "http://127.0.0.1:3000").replace(/\/$/, "");
const INDEXNOW_KEY = process.env.INDEXNOW_KEY ?? "b7e4c2f19a3d5e806f41c9b2d7a83e50";

const results = [];
const check = (name, pass, detail = "") => {
  results.push({ name, pass, detail });
  console.log(`${pass ? "PASS" : "FAIL"} ${name}${detail ? ` — ${detail}` : ""}`);
};

async function get(path, { accept = "text/html" } = {}) {
  const response = await fetch(`${BASE}${path}`, {
    headers: { Accept: accept, "User-Agent": "BlazeCV-SEO-Verify/1.0" },
    redirect: "manual",
  });
  const body = await response.text();
  return { status: response.status, body, headers: response.headers };
}

function count(text, token) {
  return text.split(token).length - 1;
}

function hasJsonLd(body, type) {
  return body.includes(`"@type":"${type}"`) || body.includes(`"@type": "${type}"`);
}

// 1. robots.txt -------------------------------------------------------------
const robots = await get("/robots.txt", { accept: "text/plain" });
check("robots.txt 可访问", robots.status === 200, `HTTP ${robots.status}`);
check(
  "robots.txt 声明 sitemap 与 host",
  /sitemap:\s*https?:\/\/\S+\/sitemap\.xml/i.test(robots.body) &&
    /host:\s*https?:\/\//i.test(robots.body),
);
check(
  "robots.txt 允许主流爬虫并屏蔽私有路径",
  robots.body.includes("Baiduspider") &&
    robots.body.includes("Googlebot") &&
    robots.body.includes("/editor") &&
    robots.body.includes("/api/"),
);

// 2. sitemap.xml ------------------------------------------------------------
const sitemap = await get("/sitemap.xml", { accept: "application/xml" });
check("sitemap.xml 可访问", sitemap.status === 200, `HTTP ${sitemap.status}`);
const locs = [...sitemap.body.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
// Template tokens are not always hex (some are short base62 ids), so count by
// path shape: exactly one segment after /templates/.
const templateUrls = locs.filter((u) => /\/templates\/[^/]+$/.test(u));
check(
  "sitemap 收录模板页 ≥ 4000",
  templateUrls.length >= 4000,
  `templates=${templateUrls.length} loc=${locs.length}`,
);
check(
  "sitemap 含用途分类 / 版式 / 指南",
  locs.some((u) => u.includes("/templates/tag/")) &&
    locs.some((u) => u.includes("/templates/layout/")) &&
    locs.some((u) => u.includes("/guides/")),
);
check("sitemap 含模板封面图", sitemap.body.includes("<image:image>"));

// 3. RSS --------------------------------------------------------------------
const feed = await get("/feed.xml", { accept: "application/rss+xml" });
check(
  "feed.xml 可访问且为 RSS",
  feed.status === 200 &&
    (feed.headers.get("content-type") ?? "").includes("rss") &&
    feed.body.includes("<rss"),
  `HTTP ${feed.status}`,
);
check(
  "feed.xml 同时包含指南与模板",
  feed.body.includes("/guides/") && /\/templates\/[^/<\s"]+</.test(feed.body),
);

// 4. 首页服务端内容 ----------------------------------------------------------
const home = await get("/");
check("首页 200", home.status === 200, `HTTP ${home.status}`);
check("首页 lang=zh-CN 与 meta description", home.body.includes('lang="zh-CN"') && /<meta name="description" content="[^"]{20,}"/.test(home.body));
check(
  "首页服务端可读关键词正文",
  home.body.includes("在线简历制作") &&
    home.body.includes("简历模板") &&
    home.body.includes("常见问题"),
);
check(
  "首页服务端含分类 / 版式 / 指南内链",
  home.body.includes("/templates/tag/") &&
    home.body.includes("/templates/layout/") &&
    home.body.includes("/guides/") &&
    home.body.includes("热门简历模板分类"),
);
check(
  "首页声明 RSS alternate",
  /<link rel="alternate"[^>]+application\/rss\+xml/.test(home.body),
);
check(
  "首页含 FAQPage 与 SearchAction 结构化数据",
  hasJsonLd(home.body, "FAQPage") &&
    home.body.includes("SearchAction") &&
    home.body.includes("/templates?q={search_term_string}"),
);
check(
  "首页含 Organization / WebSite / WebApplication",
  hasJsonLd(home.body, "Organization") &&
    hasJsonLd(home.body, "WebSite") &&
    hasJsonLd(home.body, "WebApplication"),
);
check("首页含 applicable-device（百度移动适配）", home.body.includes('name="applicable-device"'));

// 5. FAQ --------------------------------------------------------------------
const faq = await get("/faq");
check(
  "FAQ 页含 FAQPage 与 canonical",
  faq.status === 200 &&
    hasJsonLd(faq.body, "FAQPage") &&
    /<link rel="canonical" href="[^"]*\/faq"/.test(faq.body),
);

// 6. 模板详情页 --------------------------------------------------------------
const token = (templateUrls[0] ?? "").split("/").pop();
const detail = await get(`/templates/${token}`);
check(
  "模板详情页含 CreativeWork / BreadcrumbList / canonical",
  detail.status === 200 &&
    hasJsonLd(detail.body, "CreativeWork") &&
    hasJsonLd(detail.body, "BreadcrumbList") &&
    detail.body.includes(`/templates/${token}`),
);
check("模板详情页含全站页脚内链", detail.body.includes("热门简历模板分类"));

// 7. 分类 / 版式落地页 --------------------------------------------------------
const tag = await get(`/templates/tag/${encodeURIComponent("应届生")}`);
check(
  "用途分类页含 CollectionPage / ItemList / FAQPage",
  tag.status === 200 &&
    hasJsonLd(tag.body, "CollectionPage") &&
    hasJsonLd(tag.body, "ItemList") &&
    hasJsonLd(tag.body, "FAQPage"),
);
check("用途分类页含全站页脚内链", tag.body.includes("按版式浏览模板"));

const layoutPage = await get("/templates/layout/single");
check(
  "版式落地页含 CollectionPage / ItemList",
  layoutPage.status === 200 &&
    hasJsonLd(layoutPage.body, "CollectionPage") &&
    hasJsonLd(layoutPage.body, "ItemList"),
);

// 8. 模板库 ------------------------------------------------------------------
const catalogPage = await get("/templates");
check(
  "模板库页服务端含分类与指南入口",
  catalogPage.status === 200 &&
    catalogPage.body.includes("热门简历模板分类") &&
    catalogPage.body.includes("/guides/fresh-graduate-no-internship"),
);

// 8.1 分页列表：为每一套模板提供站内入口（爬虫可达性）
const firstPage = await get("/templates/page/1");
const pageLinks = (firstPage.body.match(/href="\/templates\/[^"/]+"/g) ?? []).length;
check(
  "分页列表服务端含 ≥90 个模板链接",
  firstPage.status === 200 && pageLinks >= 90,
  `links=${pageLinks}`,
);
const lastPageNumber = Math.max(1, Math.ceil(templateUrls.length / 96));
const lastPage = await get(`/templates/page/${lastPageNumber}`);
check(
  "分页末页可访问且 noindex/follow",
  lastPage.status === 200 && lastPage.body.includes("noindex"),
  `page=${lastPageNumber}`,
);

// 9. IndexNow 密钥 -----------------------------------------------------------
const keyFile = await get(`/${INDEXNOW_KEY}.txt`, { accept: "text/plain" });
check(
  "IndexNow 密钥文件可访问且内容正确",
  keyFile.status === 200 && keyFile.body.trim() === INDEXNOW_KEY,
  `HTTP ${keyFile.status}`,
);

// 10. 未知模板应 404 ---------------------------------------------------------
const missing = await fetch(`${BASE}/templates/zzzzzzzzzzzzzzzz`, { redirect: "manual" });
check("未知模板返回 404", missing.status === 404, `HTTP ${missing.status}`);

// 汇总 ----------------------------------------------------------------------
const passed = results.filter((row) => row.pass).length;
console.log(`\n${passed}/${results.length} 项通过`);
if (passed !== results.length) {
  console.log("失败项：");
  results.filter((row) => !row.pass).forEach((row) => console.log(`  - ${row.name}`));
  process.exit(1);
}

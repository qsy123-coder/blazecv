/**
 * 主动把 sitemap 里的 URL 推送给搜索引擎，缩短新页面被发现的时间。
 *
 * 支持：
 *   - IndexNow（Bing / Yandex / Naver / Seznam 共用，一次提交即可）
 *   - 百度普通收录 API（POST http://data.zz.baidu.com/urls）
 *
 * 用法：
 *   node scripts/seo-submit.mjs --dry                 # 只解析 sitemap，不发送
 *   node scripts/seo-submit.mjs --engine=indexnow     # 只推 IndexNow
 *   node scripts/seo-submit.mjs --engine=baidu --limit=2000
 *   node scripts/seo-submit.mjs --only-new            # 只推上次之后新增的 URL
 *   node scripts/seo-submit.mjs --sitemap=http://127.0.0.1:3000/sitemap.xml --dry
 *
 * 环境变量：
 *   SITE_URL          默认 https://aetouban.cn
 *   INDEXNOW_KEY      默认 public/b7e4c2f19a3d5e806f41c9b2d7a83e50.txt 的内容
 *   INDEXNOW_ENDPOINT 默认 https://api.indexnow.org/indexnow
 *   BAIDU_TOKEN       百度搜索资源平台的准入密钥（必填才会推送百度）
 *   BAIDU_SITE        默认取 SITE_URL 的 host
 *   HTTP_PROXY/HTTPS_PROXY 需要配合 NODE_USE_ENV_PROXY=1 才会生效
 *
 * 退出码：0 = 至少一个引擎成功且无失败；1 = 有失败。
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

const SITE_URL = (process.env.SITE_URL ?? "https://aetouban.cn").replace(/\/$/, "");
const SITE_HOST = new URL(SITE_URL).host;
const INDEXNOW_KEY =
  process.env.INDEXNOW_KEY ?? "b7e4c2f19a3d5e806f41c9b2d7a83e50";
const INDEXNOW_ENDPOINT =
  process.env.INDEXNOW_ENDPOINT ?? "https://api.indexnow.org/indexnow";
const BAIDU_TOKEN = process.env.BAIDU_TOKEN ?? "";
const BAIDU_SITE = process.env.BAIDU_SITE ?? SITE_HOST;
const STATE_FILE = process.env.SEO_STATE_FILE ?? ".data/seo-submitted.json";

const INDEXNOW_CHUNK = 10000;
const BAIDU_CHUNK = 2000;

function arg(name, fallback) {
  const hit = process.argv.find((item) => item === `--${name}` || item.startsWith(`--${name}=`));
  if (!hit) return fallback;
  const [, value] = hit.split("=");
  return value ?? true;
}

const DRY = Boolean(arg("dry", false));
const ONLY_NEW = Boolean(arg("only-new", false));
const ENGINE = String(arg("engine", "indexnow,baidu"));
const LIMIT = Number(arg("limit", 0)) || 0;
const SITEMAP_SOURCE = String(
  arg("sitemap", process.env.SITEMAP_URL ?? `${SITE_URL}/sitemap.xml`),
);

async function loadSitemap(source) {
  if (/^https?:\/\//i.test(source)) {
    const response = await fetch(source, {
      headers: { "User-Agent": "BlazeCV-SEO-Submit/1.0" },
      signal: AbortSignal.timeout(30000),
    });
    if (!response.ok) throw new Error(`sitemap HTTP ${response.status}`);
    return response.text();
  }
  const path = source.replace(/^file:\/\//, "");
  if (!existsSync(path)) throw new Error(`sitemap 文件不存在：${path}`);
  return readFileSync(path, "utf8");
}

function extractLocs(xml) {
  const urls = [];
  const pattern = /<loc>\s*([^<\s]+)\s*<\/loc>/g;
  let match;
  while ((match = pattern.exec(xml))) {
    urls.push(match[1].replace(/&amp;/g, "&"));
  }
  return [...new Set(urls)];
}

function readState() {
  try {
    const data = JSON.parse(readFileSync(STATE_FILE, "utf8"));
    return new Set(Array.isArray(data.urls) ? data.urls : []);
  } catch {
    return new Set();
  }
}

function writeState(set) {
  const urls = [...set].sort();
  mkdirSync(dirname(STATE_FILE), { recursive: true });
  writeFileSync(
    STATE_FILE,
    JSON.stringify({ updatedAt: new Date().toISOString(), count: urls.length, urls }, null, 0),
  );
}

function chunk(items, size) {
  const out = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

async function submitIndexNow(urls) {
  const keyLocation = `${SITE_URL}/${INDEXNOW_KEY}.txt`;
  let submitted = 0;
  const failures = [];
  for (const batch of chunk(urls, INDEXNOW_CHUNK)) {
    const response = await fetch(INDEXNOW_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json; charset=utf-8" },
      body: JSON.stringify({ host: SITE_HOST, key: INDEXNOW_KEY, keyLocation, urlList: batch }),
      signal: AbortSignal.timeout(60000),
    });
    const text = await response.text().catch(() => "");
    // 200/202 = 已接收；其他状态码记录原因。
    if (response.status === 200 || response.status === 202) {
      submitted += batch.length;
    } else {
      failures.push(`HTTP ${response.status} ${text.slice(0, 200)}`);
    }
  }
  return { engine: "IndexNow", submitted, failures };
}

async function submitBaidu(urls) {
  if (!BAIDU_TOKEN) {
    return { engine: "Baidu", submitted: 0, failures: ["缺少 BAIDU_TOKEN，已跳过"] };
  }
  const endpoint = `http://data.zz.baidu.com/urls?site=${encodeURIComponent(
    BAIDU_SITE,
  )}&token=${encodeURIComponent(BAIDU_TOKEN)}`;
  let submitted = 0;
  const failures = [];
  for (const batch of chunk(urls, BAIDU_CHUNK)) {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "text/plain" },
      body: batch.join("\n"),
      signal: AbortSignal.timeout(60000),
    });
    const text = await response.text().catch(() => "");
    let body = {};
    try {
      body = JSON.parse(text);
    } catch {
      /* keep raw text below */
    }
    if (response.ok && typeof body.success === "number") {
      submitted += body.success;
      const notSameSite = Number(body.not_same_site ?? 0);
      const notValid = Number(body.not_valid ?? 0);
      if (notSameSite || notValid) {
        failures.push(`部分拒绝：not_same_site=${notSameSite} not_valid=${notValid}`);
      }
    } else {
      failures.push(`HTTP ${response.status} ${text.slice(0, 200)}`);
    }
  }
  return { engine: "Baidu", submitted, failures };
}

const xml = await loadSitemap(SITEMAP_SOURCE);
let urls = extractLocs(xml);
console.log(`sitemap=${SITEMAP_SOURCE} urls=${urls.length}`);

if (ONLY_NEW) {
  const seen = readState();
  const fresh = urls.filter((url) => !seen.has(url));
  console.log(`only-new：新增 ${fresh.length} 条（历史已提交 ${seen.size} 条）`);
  urls = fresh;
}
if (LIMIT > 0) urls = urls.slice(0, LIMIT);

if (urls.length === 0) {
  console.log("没有需要提交的 URL，结束。");
  process.exit(0);
}

console.log(`将提交 ${urls.length} 条，例如：`);
for (const url of urls.slice(0, 3)) console.log(`  ${url}`);

if (DRY) {
  console.log("dry 模式：未发送任何请求。");
  process.exit(0);
}

const engines = String(ENGINE)
  .split(",")
  .map((item) => item.trim())
  .filter(Boolean);

const results = [];
for (const engine of engines) {
  try {
    if (engine === "indexnow") results.push(await submitIndexNow(urls));
    else if (engine === "baidu") results.push(await submitBaidu(urls));
    else results.push({ engine, submitted: 0, failures: ["未知引擎"] });
  } catch (error) {
    results.push({ engine, submitted: 0, failures: [error.message] });
  }
}

let ok = true;
for (const result of results) {
  console.log(
    `${result.engine}: submitted=${result.submitted} failures=${result.failures.length}`,
  );
  for (const failure of result.failures) console.log(`  - ${failure}`);
  if (result.failures.length > 0) ok = false;
}

if (ok) {
  const seen = readState();
  for (const url of urls) seen.add(url);
  writeState(seen);
  console.log(`已记录 ${urls.length} 条到 ${STATE_FILE}`);
}

process.exit(ok ? 0 : 1);

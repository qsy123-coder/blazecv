/**
 * 用清洗后的 template-pages/<token>.html 重新生成模板市场缩略图。
 *
 * 旧缩略图是爬虫阶段对原站的截图，仍残留旧姓名/邮箱/头像/公司名。
 * 本脚本按当前（已清洗）的模板页渲染首个 A4 页，输出 720 宽的 webp，
 * 覆盖 public/template-thumbs/<token>.webp。
 *
 * 前置：应用已在 APP_URL 运行（默认 http://127.0.0.1:3000），Edge CDP 可用。
 * 运行：
 *   CDP_URL=http://127.0.0.1:9227 node scripts/regen-template-thumbs.mjs
 * 可选：
 *   LIMIT=50 CONCURRENCY=6   # 小批量试跑
 *   FORCE=1                  # 覆盖已存在且较新的文件（默认全部覆盖）
 */
import puppeteer from "puppeteer-core";
import sharp from "sharp";
import { readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const APP_URL = (process.env.APP_URL ?? "http://127.0.0.1:3000").replace(/\/$/, "");
const CDP_URL = process.env.CDP_URL ?? "http://127.0.0.1:9227";
const THUMB_DIR = "public/template-thumbs";
const PAGE_DIR = "public/template-pages";
const CONCURRENCY = Number(process.env.CONCURRENCY ?? 5);
const LIMIT = process.env.LIMIT ? Number(process.env.LIMIT) : Infinity;

const WIDTH = 720;

// 需要生成缩略图的 token：已存在 webp 且存在对应模板页。
const tokens = readdirSync(THUMB_DIR)
  .filter((f) => f.endsWith(".webp"))
  .map((f) => f.replace(/\.webp$/, ""))
  .filter((token) => {
    try {
      return statSync(join(PAGE_DIR, `${token}.html`)).isFile();
    } catch {
      return false;
    }
  })
  .sort()
  .filter((token) => !process.env.TOKENS || process.env.TOKENS.split(",").includes(token))
  .slice(0, LIMIT);

console.log(`tokens=${tokens.length} concurrency=${CONCURRENCY}`);

const browser = await puppeteer.connect({
  browserURL: CDP_URL,
  defaultViewport: { width: 794, height: 1123, deviceScaleFactor: 1 },
  protocolTimeout: Number(process.env.PROTOCOL_TIMEOUT ?? 120000),
});

let done = 0;
let failed = 0;
const failures = [];

const CACHE_BUST = Date.now().toString(36);

async function renderToken(token) {
  const page = await browser.newPage();
  try {
    // The shared Edge profile caches template-pages/*.html aggressively; a
    // stale cached copy would render the pre-scrub identity text.
    await page.setCacheEnabled(false);
    await page.setViewport({ width: 794, height: 1123, deviceScaleFactor: 1 });
    await page.goto(
      `${APP_URL}/template-pages/${encodeURIComponent(token)}.html?cb=${CACHE_BUST}`,
      { waitUntil: "domcontentloaded", timeout: 30000 },
    );
    await page.evaluate(async () => {
      try {
        await document.fonts.ready;
      } catch {
        /* ignore */
      }
      await Promise.all(
        Array.from(document.images).map((img) => img.decode().catch(() => undefined)),
      );
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    });

    const png = await page.screenshot({
      type: "png",
      clip: { x: 0, y: 0, width: 794, height: 1123 },
    });

    const height = Math.round((WIDTH * 1123) / 794);
    await sharp(Buffer.from(png))
      .resize({ width: WIDTH, height })
      .webp({ quality: 84 })
      .toFile(join(THUMB_DIR, `${token}.webp`));
  } finally {
    await page.close().catch(() => undefined);
  }
}

async function worker(queue) {
  for (;;) {
    const token = queue.shift();
    if (!token) return;
    try {
      await renderToken(token);
      done += 1;
    } catch (error) {
      failed += 1;
      if (failures.length < 20) failures.push(`${token}: ${error.message}`);
    }
    const total = done + failed;
    if (total % 100 === 0) {
      console.log(`progress ${total}/${tokens.length} done=${done} failed=${failed}`);
    }
  }
}

const queue = [...tokens];
await Promise.all(Array.from({ length: CONCURRENCY }, () => worker(queue)));

console.log(`\nfinished done=${done} failed=${failed} total=${tokens.length}`);
if (failures.length) {
  console.log("failures (first 20):");
  failures.forEach((f) => console.log("  " + f));
}

browser.disconnect();

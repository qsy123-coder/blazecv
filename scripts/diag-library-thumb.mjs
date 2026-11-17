// 验证「我的简历」卡片缩略图与编辑器预览是否为同一套原站模板渲染。
// 1) 打开 /resumes，确认卡片里是 template-pages iframe（不再是经典 ResumePaper）
// 2) 截图卡片缩略图
// 3) 打开同一份简历的编辑器，截图第 1 页 A4
// 4) 缩放到同宽后算 RGB 残差，并保存左右对比图
import puppeteer from "puppeteer-core";
import sharp from "sharp";
import { mkdir } from "node:fs/promises";

const OUT = "F:/Projects/blazecv/tools/audit/compare";
await mkdir(OUT, { recursive: true });

const browser = await puppeteer.connect({
  browserURL: process.env.CDP_URL ?? "http://127.0.0.1:9226",
  defaultViewport: { width: 1500, height: 1400, deviceScaleFactor: 2 },
  protocolTimeout: 180000,
});

const page = await browser.newPage();
await page.goto("http://127.0.0.1:3000/resumes", {
  waitUntil: "networkidle2",
  timeout: 60000,
});
await page.waitForSelector("[data-resume-card]", { timeout: 30000 }).catch(() => undefined);

let cards = await page.$$eval("[data-resume-card]", (els) => els.length);
console.log(`resume cards: ${cards}`);
if (cards === 0) {
  // 建一份目录模板简历，供对比使用
  await page.goto("http://127.0.0.1:3000/templates", { waitUntil: "networkidle2", timeout: 60000 });
  await page.waitForSelector("[data-catalog-card]", { timeout: 30000 });
  const input = await page.$('input[aria-label="搜索模板"]');
  await input.type("应届生通用");
  await new Promise((r) => setTimeout(r, 800));
  await page.evaluate(() => {
    const card = [...document.querySelectorAll("[data-catalog-card]")].find((c) =>
      c.textContent.includes("应届生通用"),
    );
    [...(card?.querySelectorAll("button") ?? [])]
      .find((b) => b.textContent.includes("使用此模板"))
      ?.click();
  });
  await page.waitForFunction(() => location.pathname === "/editor", { timeout: 30000 });
  await page.waitForSelector("[data-resume-page]", { timeout: 30000 });
  await page.goto("http://127.0.0.1:3000/resumes", {
    waitUntil: "networkidle2",
    timeout: 60000,
  });
  await page.waitForSelector("[data-resume-card]", { timeout: 30000 });
  cards = await page.$$eval("[data-resume-card]", (els) => els.length);
  console.log(`resume cards after create: ${cards}`);
}

const card = await page.$("[data-resume-card]");
const href = await page.$eval("[data-resume-card] a", (a) => a.getAttribute("href"));

// 卡片：等缩略图 iframe 完成精确模板绑定
const thumbInfo = await page.evaluate(async () => {
  const card = document.querySelector("[data-resume-card]");
  const deadline = Date.now() + 30000;
  while (Date.now() < deadline) {
    const frame = card?.querySelector('iframe[title="模板预览缩略图"]');
    const doc = frame?.contentDocument;
    if (doc?.querySelector("#cv-container .user-name")) {
      return {
        src: frame.getAttribute("src"),
        hasContainer: !!doc.querySelector("#cv-container"),
        name: doc.querySelector("#cv-container .user-name")?.textContent?.trim() ?? "",
        height: frame.getAttribute("height"),
        width: frame.getAttribute("width"),
        exactStyle: !!doc.getElementById("blazecv-exact-style"),
      };
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  return null;
});
console.log("thumb:", JSON.stringify(thumbInfo));

const frameEl = await page.$('[data-resume-card] iframe[title="模板预览缩略图"]');
if (!frameEl) throw new Error("library card has no exact thumbnail iframe");
const thumbBuf = await frameEl.screenshot({ type: "png" });
await sharp(thumbBuf).toFile(`${OUT}/LIB-THUMB.png`);

// 编辑器同一份简历的第 1 页
const editor = await browser.newPage();
await editor.goto(`http://127.0.0.1:3000${href}`, { waitUntil: "networkidle2", timeout: 60000 });
await editor.waitForSelector('iframe[title="原站模板 1:1 预览"]', { timeout: 30000 });
await editor.waitForFunction(
  () => {
    const f = document.querySelector('iframe[title="原站模板 1:1 预览"]');
    return !!f?.contentDocument?.querySelector("#cv-container .user-name");
  },
  { timeout: 30000 },
);
await new Promise((r) => setTimeout(r, 800));
const editorInfo = await editor.evaluate(() => {
  const f = document.querySelector('iframe[title="原站模板 1:1 预览"]');
  return {
    src: f?.getAttribute("src"),
    name: f?.contentDocument?.querySelector("#cv-container .user-name")?.textContent?.trim() ?? "",
    pages: document.querySelectorAll("[data-resume-page]").length,
  };
});
console.log("editor:", JSON.stringify(editorInfo));
const pageEl = await editor.$("[data-resume-page]");
const editorBuf = await pageEl.screenshot({ type: "png" });
await sharp(editorBuf).toFile(`${OUT}/LIB-EDITOR-P1.png`);

// 同宽缩放后比较（只用于辅助判断，缩略图本身是 CSS 缩放）
const meta = await sharp(thumbBuf).metadata();
const editorSized = await sharp(editorBuf)
  .resize({ width: meta.width, height: meta.height, fit: "fill" })
  .removeAlpha()
  .raw()
  .toBuffer({ resolveWithObject: true });
const thumbSized = await sharp(thumbBuf)
  .resize({ width: meta.width, height: meta.height, fit: "fill" })
  .removeAlpha()
  .raw()
  .toBuffer({ resolveWithObject: true });
let sum = 0;
let changed = 0;
let n = 0;
const ch = thumbSized.info.channels;
for (let i = 0; i < thumbSized.data.length; i += ch) {
  for (let k = 0; k < 3; k += 1) {
    sum += Math.abs(thumbSized.data[i + k] - editorSized.data[i + k]);
  }
  const d =
    Math.abs(thumbSized.data[i] - editorSized.data[i]) +
    Math.abs(thumbSized.data[i + 1] - editorSized.data[i + 1]) +
    Math.abs(thumbSized.data[i + 2] - editorSized.data[i + 2]);
  if (d > 30) changed += 1;
  n += 1;
}
const mean = Math.round((sum / Math.max(1, n * 3)) * 100) / 100;
const changedPct = Math.round((changed / Math.max(1, n)) * 1000) / 10;
console.log(`compare: mean=${mean} changedPct=${changedPct}% size=${meta.width}x${meta.height}`);

const left = await sharp(thumbBuf).resize({ width: meta.width }).png().toBuffer();
const right = await sharp(editorBuf)
  .resize({ width: meta.width, height: meta.height, fit: "fill" })
  .png()
  .toBuffer();
await sharp({
  create: { width: meta.width * 2 + 20, height: meta.height + 40, channels: 3, background: "#d0d4da" },
})
  .composite([
    { input: left, left: 0, top: 40 },
    { input: right, left: meta.width + 20, top: 40 },
    {
      input: Buffer.from(
        `<svg width="${meta.width * 2 + 20}" height="40"><text x="10" y="26" font-family="sans-serif" font-size="16" fill="#111">我的简历卡片缩略图(左) vs 编辑器第1页(右) · mean=${mean} changed=${changedPct}%</text></svg>`,
      ),
      left: 0,
      top: 0,
    },
  ])
  .png()
  .toFile(`${OUT}/LIB-COMPARE.png`);

console.log(
  JSON.stringify({
    sameToken:
      thumbInfo?.src && editorInfo?.src
        ? thumbInfo.src.split("/").pop() === editorInfo.src.split("/").pop()
        : false,
    sameName: thumbInfo?.name === editorInfo?.name,
    mean,
    changedPct,
  }),
);

await editor.close();
await page.close();
await browser.disconnect();

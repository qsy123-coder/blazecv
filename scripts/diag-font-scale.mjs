// 验证字号控件：小/标准之间新增「中小」，以及「自定义」百分比。
import puppeteer from "puppeteer-core";
import sharp from "sharp";

const browser = await puppeteer.connect({
  browserURL: process.env.CDP_URL ?? "http://127.0.0.1:9230",
  defaultViewport: { width: 1600, height: 1000, deviceScaleFactor: 1 },
  protocolTimeout: 180000,
});
const page = await browser.newPage();
page.on("pageerror", (error) => console.log("PAGEERROR", error.message));

async function meanDiff(a, b) {
  const left = await sharp(a).grayscale().removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const right = await sharp(b).grayscale().removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const n = Math.min(left.data.length, right.data.length);
  let sum = 0;
  for (let i = 0; i < n; i += 1) sum += Math.abs(left.data[i] - right.data[i]);
  return Math.round((sum / Math.max(1, n)) * 100) / 100;
}

await page.goto("http://127.0.0.1:3000/editor?id=resume_seed_1", {
  waitUntil: "networkidle2",
  timeout: 60000,
});
await page.waitForSelector('iframe[title="原站模板 1:1 预览"]', { timeout: 30000 });
await new Promise((r) => setTimeout(r, 1500));

const buttons = await page.evaluate(() =>
  [...document.querySelectorAll("button")]
    .map((button) => button.textContent?.trim())
    .filter((text) => ["特小", "小", "中小", "标准", "大", "自定义"].includes(text ?? "")),
);
console.log("scale buttons:", JSON.stringify(buttons));

async function readFont() {
  return page.evaluate(() => {
    const frame = document.querySelector('iframe[title="原站模板 1:1 预览"]');
    const doc = frame?.contentDocument;
    const el =
      doc?.querySelector(".menu-content") ||
      doc?.querySelector(".option .title") ||
      doc?.querySelector(".user-name");
    const main = doc?.querySelector(".main");
    return {
      fontSize: el ? getComputedStyle(el).fontSize : null,
      mainFont: main ? getComputedStyle(main).fontSize : null,
      height: frame?.getAttribute("height"),
    };
  });
}

const click = (label) =>
  page.evaluate((label) => {
    [...document.querySelectorAll("button")]
      .find((button) => button.textContent?.trim() === label)
      ?.click();
  }, label);
const shot = async () => (await page.$('iframe[title="原站模板 1:1 预览"]')).screenshot({ type: "png" });

const base = await readFont();
const baseShot = await shot();

await click("中小");
await new Promise((r) => setTimeout(r, 1000));
const smd = await readFont();
const smdShot = await shot();
console.log("smd:", JSON.stringify(smd), "diff=", await meanDiff(baseShot, smdShot));

await click("自定义");
await new Promise((r) => setTimeout(r, 500));
const slider = await page.$('input[aria-label="自定义字号"]');
console.log("custom slider present:", Boolean(slider));
await page.evaluate(() => {
  const el = document.querySelector('input[aria-label="自定义字号"]');
  if (!el) return;
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")?.set;
  setter?.call(el, "110");
  el.dispatchEvent(new Event("input", { bubbles: true }));
});
await new Promise((r) => setTimeout(r, 1000));
const custom = await readFont();
const customShot = await shot();
console.log("custom 110%:", JSON.stringify(custom), "diff=", await meanDiff(smdShot, customShot));

await click("标准");
await new Promise((r) => setTimeout(r, 800));
const back = await readFont();
const backShot = await shot();
const sliderGone = await page.$('input[aria-label="自定义字号"]');
console.log(
  "back to standard:",
  JSON.stringify(back),
  "diff=",
  await meanDiff(baseShot, backShot),
  "sliderGone=",
  !sliderGone,
);

await page.screenshot({
  path: "F:/Projects/blazecv/tools/audit/compare/FONT-SCALE-CONTROLS.png",
  fullPage: false,
});
await page.close();
await browser.disconnect();

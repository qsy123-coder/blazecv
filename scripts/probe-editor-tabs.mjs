// 验证：左栏拖到最窄（单列）时出现板块 Tab，点击可定位到对应卡片。
import puppeteer from "puppeteer-core";
import { mkdir } from "node:fs/promises";

const OUT = "F:/Projects/blazecv/tools/audit/compare";
await mkdir(OUT, { recursive: true });

const browser = await puppeteer.connect({
  browserURL: process.env.CDP_URL ?? "http://127.0.0.1:9226",
  defaultViewport: { width: 1600, height: 1000 },
  protocolTimeout: 120000,
});
const page = await browser.newPage();
await page.setCacheEnabled(false);
await page.setViewport({ width: 1600, height: 1000, deviceScaleFactor: 1 });
await page.goto(`http://127.0.0.1:3000/editor?cb=${Date.now()}`, { waitUntil: "networkidle2", timeout: 60000 });
await page.evaluate(() => localStorage.removeItem("blazecv.editor-width"));
await page.reload({ waitUntil: "networkidle2", timeout: 60000 });
await page.waitForSelector("[data-resume-page]", { timeout: 30000 });
await page.waitForSelector('[role="separator"]', { timeout: 10000 });
await new Promise((r) => setTimeout(r, 800));

const state = () =>
  page.evaluate(() => {
    const aside = document.querySelector("aside");
    const tabs = [...aside.querySelectorAll("button[aria-pressed]")].map((b) => ({
      text: b.textContent?.trim(),
      active: b.getAttribute("aria-pressed") === "true",
    }));
    const cards = [...aside.querySelectorAll("[id^='editor-card-']")].map((el) => ({
      id: el.id,
      top: Math.round(el.getBoundingClientRect().top - aside.getBoundingClientRect().top),
    }));
    return {
      asideW: Math.round(aside.getBoundingClientRect().width),
      cols: getComputedStyle(aside.querySelector(".editor-cards")).columnCount,
      scrollTop: Math.round((aside.querySelector("[data-editor-scroll]")?.scrollTop) ?? aside.scrollTop),
      tabs,
      cards,
    };
  });

console.log("wide default:", JSON.stringify(await state()));

// 拖到最左侧
const sep = await page.evaluate(() => {
  const r = document.querySelector('[role="separator"]').getBoundingClientRect();
  return { x: r.x + r.width / 2, y: r.y + 300 };
});
await page.mouse.move(sep.x, sep.y);
await page.mouse.down();
await page.mouse.move(sep.x - 900, sep.y, { steps: 10 });
await page.mouse.up();
await new Promise((r) => setTimeout(r, 600));
console.log("narrow:", JSON.stringify(await state()));
await page.screenshot({ path: `${OUT}/EDITOR-TABS-NARROW.png` });

for (const label of ["内容检查", "排版与主题", "模块内容", "基本信息"]) {
  await page.evaluate((text) => {
    const aside = document.querySelector("aside");
    const btn = [...aside.querySelectorAll("button[aria-pressed]")].find(
      (b) => b.textContent?.trim() === text,
    );
    btn?.click();
  }, label);
  await new Promise((r) => setTimeout(r, 900));
  console.log(`click ${label}:`, JSON.stringify(await state()));
}

// 拖回宽栏，Tab 消失
const sep2 = await page.evaluate(() => {
  const r = document.querySelector('[role="separator"]').getBoundingClientRect();
  return { x: r.x + r.width / 2, y: r.y + 300 };
});
await page.mouse.move(sep2.x, sep2.y);
await page.mouse.down();
await page.mouse.move(sep2.x + 500, sep2.y, { steps: 8 });
await page.mouse.up();
await new Promise((r) => setTimeout(r, 500));
console.log("wide again:", JSON.stringify(await state()));

await page.close();
await browser.disconnect();

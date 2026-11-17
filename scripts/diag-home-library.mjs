// 验证：首屏三张模板封面回正、第二屏使用完整模板库并分页。
import puppeteer from "puppeteer-core";

const browser = await puppeteer.connect({
  browserURL: process.env.CDP_URL ?? "http://127.0.0.1:9271",
  defaultViewport: { width: 1920, height: 1080, deviceScaleFactor: 1 },
  protocolTimeout: 180000,
});
const page = await browser.newPage();
page.on("pageerror", (error) => console.log("PAGEERROR", error.message));
await page.goto("http://127.0.0.1:3000/", { waitUntil: "networkidle2", timeout: 60000 });
await new Promise((r) => setTimeout(r, 1800));
await page.mouse.move(960, 540);

const hero = await page.evaluate(() => {
  const card = [...document.querySelectorAll('div[class*="deg]"]')].find((el) =>
    /rotate-\[-?[0-9]+deg\]/.test(el.className),
  );
  const wrap = card?.parentElement;
  const r = (el) => {
    if (!el) return null;
    const box = el.getBoundingClientRect();
    return { x: Math.round(box.x), y: Math.round(box.y), w: Math.round(box.width), h: Math.round(box.height) };
  };
  return {
    wrap: r(wrap),
    cards: wrap ? [...wrap.children].map(r) : [],
    images: wrap ? [...wrap.querySelectorAll("img")].map((img) => img.getAttribute("src")) : [],
    badge: document.querySelector("section span.rounded-full")?.textContent?.trim(),
  };
});
console.log("hero:", JSON.stringify(hero, null, 2));
await page.screenshot({
  path: "F:/Projects/blazecv/tools/audit/compare/HOME-HERO-FINAL.png",
  fullPage: false,
});

await page.mouse.wheel({ deltaY: 120 });
await new Promise((r) => setTimeout(r, 2500));
const library = await page.evaluate(() => {
  const header = document.querySelector("header");
  const heading = [...document.querySelectorAll("h2")].find((el) =>
    el.textContent?.includes("选择一套模板开始"),
  );
  const cards = [...document.querySelectorAll("#templates button[aria-label], #templates .grid > button")];
  const first = document.querySelector("#templates .grid > button");
  return {
    scrollY: Math.round(window.scrollY),
    headerBottom: Math.round(header?.getBoundingClientRect().bottom ?? 0),
    headingTop: heading ? Math.round(heading.getBoundingClientRect().top) : null,
    cards: cards.length,
    firstCard: first?.innerText?.replace(/\s+/g, " ").trim().slice(0, 120) ?? null,
    pageInfo: document.body.innerText.match(/共 \d+ 套 · 第 \d+ \/ \d+ 页/)?.[0] ?? null,
    chips: [...document.querySelectorAll("#templates button")]
      .map((b) => b.textContent?.trim())
      .filter((t) => /^(全部|单栏|侧栏|时间轴|横幅|深色|分栏|标签)/.test(t ?? ""))
      .slice(0, 10),
  };
});
console.log("library:", JSON.stringify(library, null, 2));
await page.screenshot({
  path: "F:/Projects/blazecv/tools/audit/compare/HOME-LIBRARY-FINAL.png",
  fullPage: false,
});

const clicked = await page.evaluate(() => {
  const first = document.querySelector("#templates .grid > button");
  first?.click();
  return Boolean(first);
});
await page.waitForFunction(() => location.pathname === "/editor", { timeout: 30000 });
await page.waitForSelector('iframe[title="原站模板 1:1 预览"]', { timeout: 30000 });
await new Promise((r) => setTimeout(r, 1200));
const editor = await page.evaluate(() => {
  const frame = document.querySelector('iframe[title="原站模板 1:1 预览"]');
  return {
    title: document.querySelector('input[aria-label="简历名称"]')?.value,
    name: frame?.contentDocument?.querySelector(".user-name")?.textContent?.trim(),
    textLength: frame?.contentDocument?.body?.innerText?.length ?? 0,
  };
});
console.log("editor:", JSON.stringify(editor), "clicked=", clicked);

await page.close();
await browser.disconnect();

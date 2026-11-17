// 验证：精选模板卡片使用模板自带内容；点击后新简历有内容；编辑页「我的简历」在右侧；简历卡片 hover 按钮层级正确。
import puppeteer from "puppeteer-core";

const browser = await puppeteer.connect({
  browserURL: process.env.CDP_URL ?? "http://127.0.0.1:9248",
  defaultViewport: { width: 1600, height: 1000, deviceScaleFactor: 1 },
  protocolTimeout: 180000,
});
const page = await browser.newPage();
page.on("pageerror", (error) => console.log("PAGEERROR", error.message));

await page.goto("http://127.0.0.1:3000/", { waitUntil: "networkidle2", timeout: 60000 });
await page.waitForSelector("[data-template-id]", { timeout: 30000 });
await new Promise((r) => setTimeout(r, 3500));

const cards = await page.evaluate(() =>
  [...document.querySelectorAll("[data-template-id]")]
    .filter((el) => String(el.getAttribute("data-template-id")).startsWith("wc-"))
    .slice(0, 6)
    .map((el) => ({
      id: el.getAttribute("data-template-id"),
      name: el.querySelector("div.truncate")?.textContent?.trim() ?? "",
      hasIframe: Boolean(el.querySelector("iframe")),
      hasCover: Boolean(el.querySelector("img")),
      thumbName: el.querySelector("iframe")?.contentDocument?.querySelector(".user-name")?.textContent?.trim() ?? null,
    })),
);
console.log("featured cards:", JSON.stringify(cards, null, 2));

const target = cards.find((card) => card.hasIframe) ?? cards[0];
const clicked = await page.evaluate((id) => {
  const card = document.querySelector(`[data-template-id="${id}"]`);
  card?.click();
  return Boolean(card);
}, target.id);
await page.waitForFunction(() => location.pathname === "/editor", { timeout: 30000 });
await page.waitForSelector('iframe[title="原站模板 1:1 预览"]', { timeout: 30000 });
await new Promise((r) => setTimeout(r, 1500));

const editor = await page.evaluate(() => {
  const header = document.querySelector("header");
  const link = [...header.querySelectorAll("a")].find((a) => a.textContent?.trim() === "我的简历");
  const rect = link?.getBoundingClientRect();
  const frame = document.querySelector('iframe[title="原站模板 1:1 预览"]');
  return {
    title: document.querySelector('input[aria-label="简历名称"]')?.value,
    name: frame?.contentDocument?.querySelector(".user-name")?.textContent?.trim(),
    textLength: frame?.contentDocument?.body?.innerText?.length ?? 0,
    navLink: rect
      ? { x: Math.round(rect.x), right: Math.round(rect.right), viewport: window.innerWidth, visible: rect.width > 0 }
      : null,
  };
});
console.log("editor:", JSON.stringify(editor, null, 2), "clicked=", clicked);
await page.screenshot({
  path: "F:/Projects/blazecv/tools/audit/compare/FEATURED-EDITOR.png",
  fullPage: false,
});

// 我的简历 hover 层级
await page.goto("http://127.0.0.1:3000/resumes", { waitUntil: "networkidle2", timeout: 60000 });
await page.waitForSelector("[data-resume-card]", { timeout: 30000 });
await new Promise((r) => setTimeout(r, 1500));
await page.hover("[data-resume-card]");
await new Promise((r) => setTimeout(r, 500));
const hover = await page.evaluate(() => {
  const card = document.querySelector("[data-resume-card]");
  const overlay = [...card.querySelectorAll("div")].find((el) =>
    el.textContent?.includes("打开编辑器"),
  );
  if (!overlay) return null;
  const r = overlay.getBoundingClientRect();
  const x = Math.round(r.left + r.width / 2);
  const y = Math.round(r.top + r.height / 2);
  const top = document.elementFromPoint(x, y);
  return {
    overlayRect: { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) },
    overlayZ: getComputedStyle(overlay).zIndex,
    overlayOpacity: getComputedStyle(overlay).opacity,
    topTag: top?.tagName,
    topText: top?.textContent?.trim().slice(0, 30),
    topIsOverlay: Boolean(top && (top === overlay || overlay.contains(top))),
    iframePresent: Boolean(card.querySelector("iframe")),
  };
});
console.log("hover:", JSON.stringify(hover, null, 2));
await page.screenshot({
  path: "F:/Projects/blazecv/tools/audit/compare/RESUME-HOVER.png",
  fullPage: false,
});

await page.close();
await browser.disconnect();

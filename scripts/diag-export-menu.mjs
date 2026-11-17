// 诊断编辑页「导出」下拉：定位菜单矩形、遮挡元素与层级。
import puppeteer from "puppeteer-core";

const browser = await puppeteer.connect({
  browserURL: process.env.CDP_URL ?? "http://127.0.0.1:9226",
  defaultViewport: { width: 1500, height: 1000 },
  protocolTimeout: 120000,
});
const page = await browser.newPage();
await page.setCacheEnabled(false);
await page.goto(`http://127.0.0.1:3000/editor?cb=${Date.now()}`, { waitUntil: "networkidle2", timeout: 60000 });
await page.waitForSelector("[data-resume-page]", { timeout: 30000 });
await new Promise((r) => setTimeout(r, 600));

const info = await page.evaluate(() => {
  const summary = [...document.querySelectorAll("summary")].find((s) => s.textContent?.includes("导出"));
  summary?.click();
  const details = summary?.closest("details");
  const menu = details?.querySelector("div");
  const rect = menu?.getBoundingClientRect();
  const point = rect ? { x: rect.left + rect.width / 2, y: rect.top + 20 } : null;
  const top = point ? document.elementFromPoint(point.x, point.y) : null;
  const chain = [];
  let node = top;
  while (node && chain.length < 8) {
    chain.push({
      tag: node.tagName,
      cls: (node.className || "").toString().slice(0, 80),
      z: getComputedStyle(node).zIndex,
      pos: getComputedStyle(node).position,
      transform: getComputedStyle(node).transform !== "none",
      overflow: getComputedStyle(node).overflow,
    });
    node = node.parentElement;
  }
  const header = summary?.closest("header");
  const hs = header ? getComputedStyle(header) : null;
  return {
    menu: rect ? { x: rect.x, y: rect.y, w: rect.width, h: rect.height } : null,
    topAtMenu: chain[0] ?? null,
    chain,
    header: hs ? { z: hs.zIndex, pos: hs.position, backdrop: hs.backdropFilter } : null,
  };
});
console.log(JSON.stringify(info, null, 2));
await page.screenshot({ path: "tools/audit/compare/EXPORT-MENU-BEFORE.png" });
await page.close();
await browser.disconnect();

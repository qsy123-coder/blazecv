import puppeteer from "puppeteer-core";
import sharp from "sharp";

const names = ["2026用户运营应届生简历模板", "社会招聘通用简历模板"];
const browser = await puppeteer.connect({
  browserURL: process.env.CDP_URL ?? "http://127.0.0.1:9226",
  defaultViewport: { width: 1500, height: 1500, deviceScaleFactor: 2 },
  protocolTimeout: 240000,
});

for (const name of names) {
  const page = await browser.newPage();
  await page.goto("http://127.0.0.1:3000/templates", { waitUntil: "networkidle2", timeout: 60000 });
  await page.waitForSelector("[data-catalog-card]", { timeout: 30000 });
  const input = await page.$('input[aria-label="搜索模板"]');
  await input.type(name);
  await new Promise((r) => setTimeout(r, 700));
  await page.evaluate((n) => {
    const card = [...document.querySelectorAll("[data-catalog-card]")].find((c) => c.textContent.includes(n));
    [...(card?.querySelectorAll("button") ?? [])].find((b) => b.textContent.includes("使用此模板"))?.click();
  }, name);
  await page.waitForFunction(() => location.pathname === "/editor", { timeout: 30000 });
  await page.waitForSelector("[data-resume-page]", { timeout: 30000 });
  await new Promise((r) => setTimeout(r, 1600));

  const info = await page.evaluate(() => {
    const pf = document.querySelector("[data-resume-page]");
    const inner = pf?.firstElementChild;
    const iframe = pf?.querySelector("iframe");
    const pane = document.querySelector(".thin-scroll");
    const r = (el) => { const b = el?.getBoundingClientRect(); return b ? { x: b.x, y: b.y, w: b.width, h: b.height } : null; };
    return {
      pageFrame: r(pf),
      inner: r(inner),
      iframe: r(iframe),
      pane: pane ? { scrollLeft: pane.scrollLeft, scrollTop: pane.scrollTop, clientWidth: pane.clientWidth, scrollWidth: pane.scrollWidth } : null,
      pageCount: document.querySelectorAll("[data-resume-page]").length,
      bodyScrollX: window.scrollX,
    };
  });

  const el = await page.$("[data-resume-page]");
  const buf = await el.screenshot({ type: "png" });
  const { data, info: im } = await sharp(buf).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const row = 100;
  let whiteStart = -1;
  for (let x = 0; x < Math.min(im.width, 200); x += 1) {
    const i = (row * im.width + x) * 3;
    if (data[i] === 255 && data[i + 1] === 255 && data[i + 2] === 255) { whiteStart = x; break; }
  }
  console.log(JSON.stringify({ name, info, shot: `${im.width}x${im.height}`, whiteStart }, null, 2));
  await page.close();
}
browser.disconnect();

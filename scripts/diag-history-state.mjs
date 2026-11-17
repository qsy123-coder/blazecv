// 检查编辑器页的 history 状态：站内导航 vs 直接打开，用于决定返回按钮策略。
import puppeteer from "puppeteer-core";

const browser = await puppeteer.connect({
  browserURL: process.env.CDP_URL ?? "http://127.0.0.1:9226",
  defaultViewport: { width: 1400, height: 1000 },
  protocolTimeout: 120000,
});

async function state(page) {
  return page.evaluate(() => ({
    path: location.pathname,
    length: history.length,
    state: history.state ? JSON.parse(JSON.stringify(history.state)) : null,
    referrer: document.referrer,
  }));
}

// A) 站内：/templates → 点模板 → /editor
const a = await browser.newPage();
await a.setCacheEnabled(false);
await a.goto("http://127.0.0.1:3000/templates", { waitUntil: "networkidle2", timeout: 60000 });
await a.waitForSelector("[data-catalog-card]", { timeout: 30000 });
await a.evaluate(() => {
  const card = document.querySelector("[data-catalog-card]");
  [...(card?.querySelectorAll("button") ?? [])].find((b) => b.textContent.includes("使用此模板"))?.click();
});
await a.waitForFunction(() => location.pathname === "/editor", { timeout: 30000 });
await new Promise((r) => setTimeout(r, 800));
console.log("A 站内导航:", JSON.stringify(await state(a)));
await a.close();

// B) 直接打开 /editor
const b = await browser.newPage();
await b.setCacheEnabled(false);
await b.goto(`http://127.0.0.1:3000/editor?cb=${Date.now()}`, { waitUntil: "networkidle2", timeout: 60000 });
await b.waitForSelector("[data-resume-page]", { timeout: 30000 });
await new Promise((r) => setTimeout(r, 500));
console.log("B 直接打开:", JSON.stringify(await state(b)));
await b.close();

await browser.disconnect();

// 多模板抽查：页边距 22mm 时顶部是否仍出现分离横条。
import puppeteer from "puppeteer-core";

const names = [
  "2026用户运营应届生简历模板",
  "3-5年经验高级产品运营跳槽简历模板",
  "社会招聘通用简历模板",
  "实习生通用简历模板",
  "3-5年经验数据运营专家跳槽简历模板",
];

const browser = await puppeteer.connect({
  browserURL: process.env.CDP_URL ?? "http://127.0.0.1:9243",
  defaultViewport: { width: 1600, height: 1100, deviceScaleFactor: 2 },
  protocolTimeout: 240000,
});

for (const [index, name] of names.entries()) {
  const page = await browser.newPage();
  try {
    await page.goto("http://127.0.0.1:3000/templates", { waitUntil: "networkidle2", timeout: 60000 });
    await page.waitForSelector("[data-catalog-card]", { timeout: 30000 });
    const input = await page.$('input[aria-label="搜索模板"]');
    await input.type(name);
    await new Promise((r) => setTimeout(r, 800));
    await page.evaluate((n) => {
      const card = [...document.querySelectorAll("[data-catalog-card]")].find((c) =>
        c.textContent.includes(n),
      );
      [...(card?.querySelectorAll("button") ?? [])]
        .find((b) => b.textContent.includes("使用此模板"))
        ?.click();
    }, name);
    await page.waitForFunction(() => location.pathname === "/editor", { timeout: 30000 });
    await page.waitForSelector('iframe[title="原站模板 1:1 预览"]', { timeout: 30000 });
    await new Promise((r) => setTimeout(r, 1500));

    await page.evaluate(() => {
      const input = [...document.querySelectorAll('input[type="range"]')].find(
        (el) => Number(el.max) >= 15 && Number(el.max) < 100,
      );
      if (!input) return;
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")?.set;
      setter?.call(input, "22");
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await new Promise((r) => setTimeout(r, 1500));

    const info = await page.evaluate(() => {
      const frame = document.querySelector('iframe[title="原站模板 1:1 预览"]');
      const doc = frame?.contentDocument;
      const rect = (sel) => {
        const el = doc?.querySelector(sel);
        if (!el) return null;
        const r = el.getBoundingClientRect();
        return { top: Math.round(r.top), bottom: Math.round(r.bottom), left: Math.round(r.left), w: Math.round(r.width) };
      };
      return {
        token: (frame?.getAttribute("src") ?? "").split("/").pop(),
        pages: document.querySelectorAll("[data-resume-page]").length,
        main: rect(".main"),
        line: rect(".header-line"),
        pattern: rect(".cv-pattern"),
        content: rect(".content"),
        lineBg: doc?.querySelector(".header-line") ? getComputedStyle(doc.querySelector(".header-line")).backgroundColor : null,
      };
    });
    console.log(index, name, JSON.stringify(info));
    const pageEl = await page.$("[data-resume-page]");
    if (pageEl) {
      await pageEl.screenshot({
        path: `F:/Projects/blazecv/tools/audit/compare/MARGIN-MULTI-${index}.png`,
        type: "png",
      });
    }
  } catch (error) {
    console.log(index, name, "ERR", String(error?.message ?? error).slice(0, 160));
  } finally {
    await page.close().catch(() => undefined);
  }
}

await browser.disconnect();

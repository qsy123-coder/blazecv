import puppeteer from "puppeteer-core";

const BASE = "http://127.0.0.1:3000";
const browser = await puppeteer.connect({
  browserURL: process.env.CDP_URL ?? "http://127.0.0.1:9226",
  defaultViewport: { width: 1500, height: 1300 },
  protocolTimeout: 180000,
});

async function open(name) {
  const page = await browser.newPage();
  await page.goto(`${BASE}/templates`, { waitUntil: "networkidle2", timeout: 60000 });
  await page.waitForSelector("[data-catalog-card]", { timeout: 30000 });
  const input = await page.$('input[aria-label="搜索模板"]');
  await input.type(name);
  await new Promise((r) => setTimeout(r, 700));
  await page.evaluate((n) => {
    const card = [...document.querySelectorAll("[data-catalog-card]")].find((c) => c.textContent.includes(n));
    [...(card?.querySelectorAll("button") ?? [])].find((b) => b.textContent.includes("使用此模板"))?.click();
  }, name);
  await page.waitForFunction(() => location.pathname === "/editor", { timeout: 30000 });
  await page.waitForSelector('iframe[title="原站模板 1:1 预览"]', { timeout: 30000 });
  await new Promise((r) => setTimeout(r, 1600));
  return page;
}

const rightTitles = (page) =>
  page.evaluate(() => {
    const f = document.querySelector('iframe[title="原站模板 1:1 预览"]');
    const d = f?.contentDocument;
    if (!d) return [];
    return [...d.querySelectorAll(".option")]
      .filter((o) => getComputedStyle(o).display !== "none")
      .map((o) => (o.querySelector(".module-title-wrapper .title")?.textContent || "").trim());
  });

const rightHas = (page, text) =>
  page.evaluate((t) => {
    const f = document.querySelector('iframe[title="原站模板 1:1 预览"]');
    return f?.contentDocument?.body?.textContent?.includes(t) ?? false;
  }, text);

const pageCount = (page) => page.evaluate(() => document.querySelectorAll("[data-resume-page]").length);

// 1) MOVE module order
{
  const page = await open("应届生通用简历模板");
  const before = await rightTitles(page);
  await page.evaluate(() => {
    const btns = [...document.querySelectorAll('button[aria-label="上移"]')];
    btns[1]?.click();
  });
  await new Promise((r) => setTimeout(r, 1400));
  const after = await rightTitles(page);
  const changed = JSON.stringify(before) !== JSON.stringify(after);
  console.log(`${changed ? "PASS" : "FAIL"} 移动模块顺序生效 — before=${JSON.stringify(before)} after=${JSON.stringify(after)}`);
  await page.close();
}

// 2) ADD module (exact "自定义模块" button)
{
  const page = await open("应届生通用简历模板");
  await page.evaluate(() => {
    const summary = [...document.querySelectorAll("summary")].find((s) => s.textContent?.includes("添加模块"));
    summary?.click();
  });
  await new Promise((r) => setTimeout(r, 300));
  const clicked = await page.evaluate(() => {
    const btn = [...document.querySelectorAll("button")].find((b) => (b.textContent || "").trim() === "自定义模块");
    btn?.click();
    return Boolean(btn);
  });
  await new Promise((r) => setTimeout(r, 1800));
  const has = await rightHas(page, "自定义模块");
  console.log(`${has ? "PASS" : "FAIL"} 添加模块生效 — clicked=${clicked} shown=${has}`);
  await page.close();
}

// 3) ADD link in basics
{
  const page = await open("应届生通用简历模板");
  const added = await page.evaluate(() => {
    const add = [...document.querySelectorAll("button")].find((b) => b.textContent?.trim() === "添加");
    add?.click();
    return Boolean(add);
  });
  await new Promise((r) => setTimeout(r, 300));
  await page.evaluate(() => {
    const inputs = [...document.querySelectorAll("input")].filter((i) => i.type !== "file" && i.value === "");
    const set = (el, v) => {
      const s = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")?.set;
      s?.call(el, v);
      el.dispatchEvent(new Event("input", { bubbles: true }));
    };
    if (inputs[0]) set(inputs[0], "GitHub");
    if (inputs[1]) set(inputs[1], "github.com/verify");
  });
  await new Promise((r) => setTimeout(r, 1400));
  const shown = await rightHas(page, "github.com/verify");
  console.log(`${shown ? "PASS" : "FAIL"} 基本信息添加链接显示 — added=${added} shown=${shown}`);
  await page.close();
}

// 4) AUTO FIT one page
{
  const page = await open("2026用户运营应届生简历模板");
  const beforeCount = await pageCount(page);
  const clicked = await page.evaluate(() => {
    const b = [...document.querySelectorAll("button")].find((x) => x.textContent?.includes("自动适配一页"));
    b?.click();
    return Boolean(b);
  });
  await new Promise((r) => setTimeout(r, 8000));
  const afterCount = await pageCount(page);
  console.log(`${afterCount < beforeCount || afterCount === 1 ? "PASS" : "FAIL"} 自动适配一页生效 — clicked=${clicked} pages ${beforeCount} -> ${afterCount}`);
  await page.close();
}

browser.disconnect();

import puppeteer from "puppeteer-core";

const browser = await puppeteer.connect({
  browserURL: process.env.CDP_URL ?? "http://127.0.0.1:9226",
  defaultViewport: { width: 1500, height: 1300 },
  protocolTimeout: 120000,
});
const page = await browser.newPage();
await page.goto("http://127.0.0.1:3000/templates", { waitUntil: "networkidle2", timeout: 60000 });
await page.waitForSelector("[data-catalog-card]", { timeout: 30000 });
const input = await page.$('input[aria-label="搜索模板"]');
await input.type("应届生通用简历模板");
await new Promise((r) => setTimeout(r, 700));
await page.evaluate(() => {
  const card = [...document.querySelectorAll("[data-catalog-card]")].find((c) => c.textContent.includes("应届生通用"));
  [...(card?.querySelectorAll("button") ?? [])].find((b) => b.textContent.includes("使用此模板"))?.click();
});
await page.waitForFunction(() => location.pathname === "/editor", { timeout: 30000 });
await page.waitForSelector('iframe[title="原站模板 1:1 预览"]', { timeout: 30000 });
await new Promise((r) => setTimeout(r, 1600));

const readTitles = () => page.evaluate(() => {
  const f = document.querySelector('iframe[title="原站模板 1:1 预览"]');
  const d = f?.contentDocument;
  return d ? [...d.querySelectorAll(".option")].filter((o) => getComputedStyle(o).display !== "none").map((o) => (o.querySelector(".module-title-wrapper .title")?.textContent || "").trim()) : [];
});

console.log("before titles", JSON.stringify(await readTitles()));
console.log("before left custom count", await page.evaluate(() => (document.body.textContent || "").split("自定义模块").length - 1));

await page.evaluate(() => {
  const summary = [...document.querySelectorAll("summary")].find((s) => s.textContent?.includes("添加模块"));
  summary?.click();
});
await new Promise((r) => setTimeout(r, 300));
const clicked = await page.evaluate(() => {
  const btns = [...document.querySelectorAll("button")].filter((b) => (b.textContent || "").includes("自定义"));
  btns.forEach((b) => console.log); // noop
  btns[0]?.click();
  return btns.map((b) => (b.textContent || "").trim());
});
console.log("buttons matched", JSON.stringify(clicked));
await new Promise((r) => setTimeout(r, 1800));
console.log("after left custom count", await page.evaluate(() => (document.body.textContent || "").split("自定义模块").length - 1));
console.log("after titles", JSON.stringify(await readTitles()));
const info = await page.evaluate(() => {
  const f = document.querySelector('iframe[title="原站模板 1:1 预览"]');
  const d = f?.contentDocument;
  const opt = d?.querySelector(".option.custom");
  return {
    customExists: Boolean(opt),
    optionsTotal: d ? d.querySelectorAll(".option").length : -1,
    hiddenCustom: opt ? getComputedStyle(opt).display : null,
  };
});
console.log("info", JSON.stringify(info));
await page.close();
browser.disconnect();

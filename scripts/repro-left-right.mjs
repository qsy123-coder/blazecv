import puppeteer from "puppeteer-core";

const name = process.argv[2] ?? "应届生通用简历模板";
const browser = await puppeteer.connect({
  browserURL: process.env.CDP_URL ?? "http://127.0.0.1:9226",
  defaultViewport: { width: 1500, height: 1200 },
  protocolTimeout: 120000,
});
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
await page.waitForSelector('iframe[title="原站模板 1:1 预览"]', { timeout: 30000 });
await new Promise((r) => setTimeout(r, 1600));

const info = await page.evaluate(() => {
  // Left panel: collect section titles + item text from the editing forms.
  const leftText = document.querySelector(".app-shell")?.textContent ?? "";
  // Right: visible options and their text.
  const f = document.querySelector('iframe[title="原站模板 1:1 预览"]');
  const d = f?.contentDocument;
  const right = d
    ? [...d.querySelectorAll(".option")].filter((o) => getComputedStyle(o).display !== "none").map((o) => {
        const t = o.querySelector(".module-title-wrapper .title")?.textContent?.trim() || o.querySelector(".title")?.textContent?.trim() || "";
        const cls = [...o.classList].filter((c) => ["personal_summary","works","edus","project_experience","orgs","honor","extras","custom"].includes(c)).join(",");
        const items = [...o.querySelectorAll(".section-item-container")].length;
        return { cls, title: t, items };
      })
    : [];
  // Right extras rows
  const extras = d
    ? [...d.querySelectorAll(".option.extras .extras-icon-item, .option.extras li.extras-item")].map((n) => n.textContent.trim().slice(0, 30))
    : [];
  return { right, extras, leftHasWork: leftText.includes("工作经历"), leftLen: leftText.length };
});
console.log(JSON.stringify(info, null, 1));
await page.screenshot({ path: "C:/Users/WINDOWS11/AppData/Local/Temp/editor-check.png" });
await page.close();
browser.disconnect();

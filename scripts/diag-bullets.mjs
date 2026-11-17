import puppeteer from "puppeteer-core";
import { readFile } from "node:fs/promises";

const token = process.argv[2];
const content = JSON.parse(
  await readFile(`F:/Projects/blazecv/public/template-content/${token}.json`, "utf8"),
);
const exp = content.sections.find((s) => s.type === "experience" || s.type === "projects");
console.log("CONTENT bullet counts:", (content.sections.filter(s => s.items && s.items[0]?.bullets).map(s => s.type + ":" + s.items.map(i => i.bullets.length).join("/"))).join("  "));

const browser = await puppeteer.connect({
  browserURL: process.env.CDP_URL ?? "http://127.0.0.1:9226",
  defaultViewport: { width: 900, height: 2600, deviceScaleFactor: 1 },
  protocolTimeout: 120000,
});
const page = await browser.newPage();
await page.setRequestInterception(true).catch(() => undefined);
page.on("request", (req) => {
  try {
    const u = req.url();
    const host = u.startsWith("data:") || u.startsWith("blob:") || u.startsWith("about:") ? "" : new URL(u).host;
    if (!host || /^(127\.0\.0\.1|localhost)(:\d+)?$/i.test(host)) req.continue().catch(() => {});
    else req.abort().catch(() => {});
  } catch {
    req.continue().catch(() => {});
  }
});
await page.goto(`http://127.0.0.1:3000/audit?token=${token}`, {
  waitUntil: "domcontentloaded",
  timeout: 45000,
});
await page.waitForSelector('iframe[title="原站模板 1:1 预览"]', { timeout: 30000 });
await page.waitForFunction(() => document.querySelector("[data-audit-ready='1']"), { timeout: 45000 });
await new Promise((r) => setTimeout(r, 250));
const liCounts = () => {
  const f = document.querySelector('iframe[title="原站模板 1:1 预览"]');
  const d = f.contentDocument;
  const out = {};
  for (const cls of ["works", "project_experience", "orgs"]) {
    const o = d.querySelector(".option." + cls);
    if (o) out[cls] = [...o.querySelectorAll(".section-item-container")].map(i => i.querySelectorAll(".menu-content li").length);
  }
  return out;
};
console.log("RAW liCounts", JSON.stringify(await page.evaluate(liCounts)));
await page.evaluate(async () => (typeof window.__auditApply === "function" ? await window.__auditApply() : 0));
await new Promise((r) => setTimeout(r, 250));
console.log("BOUND liCounts", JSON.stringify(await page.evaluate(liCounts)));
await page.close();
browser.disconnect();

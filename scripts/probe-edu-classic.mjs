// 在真实编辑器流程里验证经典模板（如默认 商务蓝，无 exact token）的教育「补充」多行渲染。
// 打开 /editor → 找到 placeholder 含 GPA 的 textarea → 键盘输入三行 → 读取 [data-resume-page]。
import puppeteer from "puppeteer-core";

const browser = await puppeteer.connect({
  browserURL: process.env.CDP_URL ?? "http://127.0.0.1:9226",
  defaultViewport: { width: 1500, height: 1300, deviceScaleFactor: 2 },
  protocolTimeout: 120000,
});
const page = await browser.newPage();
await page.setCacheEnabled(false);
await page.goto(`http://127.0.0.1:3000/editor?cb=${Date.now()}`, { waitUntil: "networkidle2", timeout: 60000 });
await page.waitForSelector("[data-resume-page]", { timeout: 30000 });
await new Promise((r) => setTimeout(r, 800));

const before = await page.evaluate(() => {
  const area = [...document.querySelectorAll("textarea")].find((a) => (a.placeholder || "").includes("GPA"));
  const badge = [...document.querySelectorAll("span")].find((s) => s.textContent?.includes("商务蓝"))?.textContent;
  return {
    badge,
    exactIframe: !!document.querySelector('iframe[title="原站模板 1:1 预览"]'),
    hasArea: !!area,
    value: area?.value ?? null,
    pages: document.querySelectorAll("[data-resume-page]").length,
  };
});
console.log("before:", JSON.stringify(before));

if (!before.hasArea) throw new Error("no education detail textarea");

await page.evaluate(() => {
  const area = [...document.querySelectorAll("textarea")].find((a) => (a.placeholder || "").includes("GPA"));
  area.focus();
  area.setSelectionRange(0, area.value.length);
  area.setSelectionRange(area.value.length, area.value.length);
});
// 清空后键入三行
await page.keyboard.down("Control");
await page.keyboard.press("KeyA");
await page.keyboard.up("Control");
await page.keyboard.press("Backspace");
await page.keyboard.type("GPA 3.9 / 专业前 5%");
await page.keyboard.press("Enter");
await page.keyboard.type("校级三好学生");
await page.keyboard.press("Enter");
await page.keyboard.type("国家奖学金");
await new Promise((r) => setTimeout(r, 900));

const after = await page.evaluate(() => {
  const area = [...document.querySelectorAll("textarea")].find((a) => (a.placeholder || "").includes("GPA"));
  const pageEl = document.querySelector("[data-resume-page]");
  const sec = [...(pageEl?.querySelectorAll("[data-section-id]") ?? [])].find((s) =>
    s.textContent?.includes("示例大学"),
  );
  const bullets = [...(sec?.querySelectorAll("ul li") ?? [])].map((li) => li.textContent?.trim());
  return {
    value: area?.value ?? null,
    lineCount: (area?.value ?? "").split("\n").length,
    bullets,
    sectionText: sec?.innerText?.slice(0, 200) ?? null,
  };
});
console.log("after:", JSON.stringify(after, null, 2));

const el = await page.$("[data-resume-page]");
if (el) await el.screenshot({ path: "tools/audit/compare/EDU-CLASSIC-P1.png" });
await page.close();
await browser.disconnect();

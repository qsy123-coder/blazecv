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
await new Promise((r) => setTimeout(r, 1500));

// add education
await page.evaluate(() => {
  const summary = [...document.querySelectorAll("summary")].find((s) => s.textContent?.includes("添加模块"));
  summary?.click();
});
await new Promise((r) => setTimeout(r, 300));
await page.evaluate(() => {
  [...document.querySelectorAll("button")].find((b) => (b.textContent || "").trim() === "教育经历")?.click();
});
await new Promise((r) => setTimeout(r, 1200));

// expand the new education card (header button, not the add-menu button)
const expanded = await page.evaluate(() => {
  const btns = [...document.querySelectorAll("button")].filter(
    (b) => !b.closest("details") && (b.textContent || "").includes("教育经历"),
  );
  const btn = btns[btns.length - 1];
  btn?.click();
  return Boolean(btn);
});
await new Promise((r) => setTimeout(r, 600));
const ta = await page.$('textarea[placeholder^="GPA"]');
console.log("expanded", expanded, "textarea", Boolean(ta), "rows", ta ? await ta.evaluate((e) => e.rows) : null);
if (ta) {
  await ta.evaluate((el, value) => {
    const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, "value")?.set;
    setter?.call(el, value);
    el.dispatchEvent(new Event("input", { bubbles: true }));
  }, "GPA 3.9\n排名前5%\n三好学生");
  await new Promise((r) => setTimeout(r, 1500));
  const info = await page.evaluate(() => {
    const f = document.querySelector('iframe[title="原站模板 1:1 预览"]');
    const d = f?.contentDocument;
    const edu = d
      ? [...d.querySelectorAll(".option")].find((o) => (o.querySelector(".module-title-wrapper .title")?.textContent || "").trim() === "教育经历")
      : null;
    return {
      li: edu ? [...edu.querySelectorAll(".menu-content ul li")].map((li) => li.textContent) : [],
    };
  });
  console.log(JSON.stringify(info));
  const ok = info.li.length >= 3 && info.li.some((t) => t.includes("GPA")) && info.li.some((t) => t.includes("三好"));
  console.log(ok ? "PASS 补充可换行且生成三条圆点" : "FAIL 补充换行/条目未生效");
}
await page.close();
browser.disconnect();

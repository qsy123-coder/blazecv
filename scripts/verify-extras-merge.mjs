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

const titles = () =>
  page.evaluate(() => {
    const f = document.querySelector('iframe[title="原站模板 1:1 预览"]');
    const d = f?.contentDocument;
    return d
      ? [...d.querySelectorAll(".option")]
          .filter((o) => getComputedStyle(o).display !== "none")
          .map((o) => (o.querySelector(".module-title-wrapper .title")?.textContent || "").trim())
      : [];
  });

const before = await titles();
console.log("before", JSON.stringify(before));

// Move the last two sections up twice (skills/language area) to trigger orderEdited.
for (let i = 0; i < 2; i += 1) {
  await page.evaluate(() => {
    const btns = [...document.querySelectorAll('button[aria-label="上移"]')];
    btns[btns.length - 1]?.click();
  });
  await new Promise((r) => setTimeout(r, 1200));
}
const after = await titles();
console.log("after", JSON.stringify(after));

const split = after.filter((t) => t === "技能" || t === "语言");
const othersCount = after.filter((t) => t === "其他" || t === "其它").length;
const sameMultiset = JSON.stringify([...before].sort()) === JSON.stringify([...after].sort());
console.log(`${split.length === 0 ? "PASS" : "FAIL"} 移动后技能/语言不再独立成模块 — split=${JSON.stringify(split)}`);
console.log(`${othersCount <= 1 ? "PASS" : "FAIL"} 只有一个「其它/其他」合并块 — count=${othersCount}`);
console.log(`${sameMultiset ? "PASS" : "FAIL"} 模块集合不变（未新增/丢失模块）— before=${before.length} after=${after.length}`);
await page.close();
browser.disconnect();

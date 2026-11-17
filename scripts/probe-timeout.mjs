import puppeteer from "puppeteer-core";

const tokens = process.argv.slice(2);
const browser = await puppeteer.connect({
  browserURL: process.env.CDP_URL ?? "http://127.0.0.1:9227",
  defaultViewport: { width: 900, height: 2600, deviceScaleFactor: 1 },
  protocolTimeout: 300000,
});
const page = await browser.newPage();
page.on("console", (msg) => {
  const text = msg.text();
  if (/error|fail|exception/i.test(text)) console.log("  console:", text.slice(0, 200));
});
page.on("pageerror", (err) => console.log("  pageerror:", String(err).slice(0, 300)));
for (const token of tokens) {
  const t0 = Date.now();
  try {
    await page.goto(`http://127.0.0.1:3000/audit?token=${token}`, {
      waitUntil: "domcontentloaded",
      timeout: 60000,
    });
    await page.waitForSelector('iframe[title="原站模板 1:1 预览"]', { timeout: 30000 });
    await page.waitForFunction(
      () => document.querySelector("[data-audit-ready='1']"),
      { timeout: 60000 },
    );
    const info = await page.evaluate(() => {
      const frame = document.querySelector('iframe[title="原站模板 1:1 预览"]');
      const doc = frame?.contentDocument;
      return {
        h: document.querySelector("[data-audit-height]")?.dataset.auditHeight,
        optionCount: doc ? doc.querySelectorAll(".option").length : -1,
        mainH: doc ? Math.round(doc.querySelector(".main").getBoundingClientRect().height) : -1,
      };
    });
    console.log(`${token} ready in ${Date.now() - t0}ms`, JSON.stringify(info));
  } catch (error) {
    console.log(`${token} FAILED after ${Date.now() - t0}ms:`, String(error?.message ?? error).slice(0, 200));
  }
}
await page.close();
browser.disconnect();

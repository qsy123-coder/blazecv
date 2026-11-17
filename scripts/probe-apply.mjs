import puppeteer from "puppeteer-core";

const tokens = process.argv.slice(2);
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
for (const token of tokens) {
  const t0 = Date.now();
  try {
    await page.goto(`http://127.0.0.1:3000/audit?token=${token}`, {
      waitUntil: "domcontentloaded",
      timeout: 45000,
    });
    await page.waitForSelector('iframe[title="原站模板 1:1 预览"]', { timeout: 20000 });
    await page.waitForFunction(
      () => document.querySelector("[data-audit-ready='1']"),
      { timeout: 30000 },
    );
    const rawH = await page.evaluate(
      () => document.querySelector("[data-audit-height]")?.dataset.auditHeight,
    );
    const bound = await page.evaluate(async () => {
      try {
        return await window.__auditApply();
      } catch (e) {
        return "ERR:" + String(e?.message ?? e);
      }
    });
    const boundH = await page.evaluate(
      () => document.querySelector("[data-audit-height]")?.dataset.auditHeight,
    );
    console.log(token, "ok", Date.now() - t0, "ms rawH=" + rawH, "apply=" + bound, "dataH=" + boundH);
  } catch (e) {
    console.log(token, "FAIL", Date.now() - t0, "ms", String(e?.message ?? e).slice(0, 160));
  }
}
await page.close();
browser.disconnect();

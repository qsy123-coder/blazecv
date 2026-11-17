import puppeteer from "puppeteer-core";
import sharp from "sharp";

const token = process.argv[2];
const browser = await puppeteer.connect({
  browserURL: process.env.CDP_URL ?? "http://127.0.0.1:9227",
  defaultViewport: { width: 900, height: 2600, deviceScaleFactor: 1 },
  protocolTimeout: 120000,
});
const page = await browser.newPage();
const t0 = Date.now();
const lap = (label) => console.log(`[${Date.now() - t0}ms] ${label}`);

try {
  lap("goto raw");
  await page.goto(`http://127.0.0.1:3000/template-pages/${token}.html`, {
    waitUntil: "networkidle2",
    timeout: 45000,
  });
  lap("raw loaded");
  await new Promise((r) => setTimeout(r, 450));
  const rawHeight = await page.evaluate(() => {
    const main = document.querySelector(".main");
    const content = document.querySelector(".content");
    const scroll = document.querySelector(".content-scroll");
    if (content) {
      content.style.height = "auto";
      content.style.overflow = "visible";
    }
    if (scroll) {
      scroll.style.height = "auto";
      scroll.style.overflow = "visible";
    }
    main.style.height = "auto";
    main.style.minHeight = "0";
    void main.offsetHeight;
    const h = Math.max(1123, Math.ceil(main.getBoundingClientRect().height));
    main.style.height = `${h}px`;
    main.style.minHeight = "0";
    return h;
  });
  lap("raw evaluate done, h=" + rawHeight);
  const rawEl = await page.$("#cv-container");
  lap("raw element");
  const rawShot = await rawEl.screenshot({ type: "png" });
  lap("raw screenshot " + rawShot.length);
  await sharp(rawShot).removeAlpha().raw().toBuffer();
  lap("raw sharp done");

  lap("goto audit");
  await page.goto(`http://127.0.0.1:3000/audit?token=${token}`, {
    waitUntil: "domcontentloaded",
    timeout: 45000,
  });
  lap("audit loaded");
  await page.waitForSelector('iframe[title="原站模板 1:1 预览"]', { timeout: 30000 });
  lap("iframe present");
  await page.waitForFunction(
    () => document.querySelector("[data-audit-ready='1']"),
    { timeout: 45000 },
  );
  lap("audit ready");
  await new Promise((r) => setTimeout(r, 700));
  const boundHeight = await page.evaluate(
    () => Number(document.querySelector("[data-audit-height]")?.dataset.auditHeight ?? 0),
  );
  lap("bound height " + boundHeight);
  const frame = await page.$('iframe[title="原站模板 1:1 预览"]');
  lap("frame element");
  const boundShot = await frame.screenshot({ type: "png" });
  lap("bound screenshot " + boundShot.length);
  await sharp(boundShot).removeAlpha().raw().toBuffer();
  lap("bound sharp done");
} catch (error) {
  console.log("FAILED at", Date.now() - t0, "ms:", String(error?.message ?? error));
}
await page.close();
browser.disconnect();

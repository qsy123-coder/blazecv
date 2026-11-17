import puppeteer from "puppeteer-core";
import sharp from "sharp";

const tokens = ["d9d0ec05a0515f93", "041f5a2d7961a92f", "7035794f6173aa72"];
const browser = await puppeteer.connect({
  browserURL: process.env.CDP_URL ?? "http://127.0.0.1:9227",
  defaultViewport: { width: 900, height: 2600, deviceScaleFactor: 1 },
  protocolTimeout: 120000,
});
const page = await browser.newPage();

for (const token of tokens) {
  const t0 = Date.now();
  try {
    await page.goto(`http://127.0.0.1:3000/template-pages/${token}.html`, {
      waitUntil: "networkidle2",
      timeout: 45000,
    });
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
    const rawEl = await page.$("#cv-container");
    const rawShot = await rawEl.screenshot({ type: "png" });

    await page.goto(`http://127.0.0.1:3000/audit?token=${token}`, {
      waitUntil: "domcontentloaded",
      timeout: 45000,
    });
    await page.waitForSelector('iframe[title="原站模板 1:1 预览"]', { timeout: 30000 });
    await page.waitForFunction(
      () => document.querySelector("[data-audit-ready='1']"),
      { timeout: 45000 },
    );
    await new Promise((r) => setTimeout(r, 700));
    const boundHeight = await page.evaluate(
      () => Number(document.querySelector("[data-audit-height]")?.dataset.auditHeight ?? 0),
    );
    const frame = await page.$('iframe[title="原站模板 1:1 预览"]');
    const boundShot = await frame.screenshot({ type: "png" });

    const rd = await sharp(rawShot).removeAlpha().raw().toBuffer({ resolveWithObject: true });
    const bd = await sharp(boundShot).removeAlpha().raw().toBuffer({ resolveWithObject: true });
    let mean = `heightMismatch(${rawHeight}/${boundHeight})`;
    if (rawHeight === boundHeight) {
      const W = 794;
      const H = rawHeight;
      let sum = 0;
      for (let i = 0; i < W * H; i += 1) {
        const o = i * 3;
        sum +=
          Math.abs(rd.data[o] - bd.data[o]) +
          Math.abs(rd.data[o + 1] - bd.data[o + 1]) +
          Math.abs(rd.data[o + 2] - bd.data[o + 2]);
      }
      mean = Math.round((sum / (W * H * 3)) * 100) / 100;
    }
    console.log(token, "ok in", Date.now() - t0, "ms mean=" + mean);
  } catch (error) {
    console.log(token, "FAILED", Date.now() - t0, "ms", String(error?.message ?? error).slice(0, 160));
  }
}
await page.close();
browser.disconnect();

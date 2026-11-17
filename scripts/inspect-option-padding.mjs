// 查看 .option 内部（信息区）的左右留白来源。
import puppeteer from "puppeteer-core";

const tokens = process.argv.slice(2);
if (tokens.length === 0) tokens = ["bbb107de5b600df0", "cbd7600944137f93"];

const browser = await puppeteer.connect({
  browserURL: process.env.CDP_URL ?? "http://127.0.0.1:9226",
  defaultViewport: { width: 900, height: 1300 },
  protocolTimeout: 120000,
});

for (const token of tokens) {
  const page = await browser.newPage();
  await page.setCacheEnabled(false);
  await page.goto(`http://127.0.0.1:3000/template-pages/${encodeURIComponent(token)}.html`, {
    waitUntil: "networkidle2",
    timeout: 60000,
  });
  const rows = await page.evaluate(() => {
    const out = [];
    for (const opt of [...document.querySelectorAll(".content .option")].slice(0, 4)) {
      const info = opt.querySelector(".info-content");
      const title = opt.querySelector(".module-title-wrapper");
      const item = opt.querySelector(".section-item-container");
      const desc = (el) => {
        if (!el) return null;
        const cs = getComputedStyle(el);
        const r = el.getBoundingClientRect();
        return { x: Math.round(r.x), w: Math.round(r.width), pad: cs.padding, margin: cs.margin };
      };
      out.push({
        option: opt.className.toString().slice(0, 60),
        opt: desc(opt),
        info: desc(info),
        title: desc(title),
        item: desc(item),
      });
    }
    return out;
  });
  console.log("=== " + token);
  for (const r of rows) console.log(JSON.stringify(r));
  await page.close();
}
await browser.disconnect();

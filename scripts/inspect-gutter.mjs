// 查看模板内容两侧的留白来自哪一层（option / info-content / 内部 wrapper）。
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
    const main = document.querySelector(".main");
    const content = document.querySelector(".content");
    const walk = (el, depth) => {
      if (depth > 3) return;
      const cs = getComputedStyle(el);
      const r = el.getBoundingClientRect();
      if (r.width > 0 && depth <= 2) {
        out.push({
          depth,
          tag: el.tagName.toLowerCase(),
          cls: (el.className || "").toString().slice(0, 70),
          x: Math.round(r.x),
          w: Math.round(r.width),
          pad: cs.padding,
          margin: cs.margin,
          box: cs.boxSizing,
        });
      }
      const child = el.children;
      for (let i = 0; i < child.length && i < 6; i += 1) walk(child[i], depth + 1);
    };
    if (content) walk(content, 0);
    const user = document.querySelector(".user");
    if (user) {
      const cs = getComputedStyle(user);
      const r = user.getBoundingClientRect();
      out.push({ depth: 99, tag: "div", cls: "user", x: Math.round(r.x), w: Math.round(r.width), pad: cs.padding, margin: cs.margin });
    }
    return { mainPad: getComputedStyle(main).padding, rows: out };
  });
  console.log("=== " + token, rows.mainPad);
  for (const r of rows.rows) console.log(JSON.stringify(r));
  await page.close();
}
await browser.disconnect();

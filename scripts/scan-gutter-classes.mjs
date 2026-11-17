// 扫描模板里承担左右页边距的元素（margin/padding 左右非 0），找出可统一调整的类。
import puppeteer from "puppeteer-core";

let tokens = process.argv.slice(2);
if (tokens.length === 0)
  tokens = ["bbb107de5b600df0", "d9d0ec05a0515f93", "cbd7600944137f93", "30a05e70bbc608a4", "571b5820a435fe67"];

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
    const counts = new Map();
    const scope = document.querySelector(".main");
    if (!scope) return [];
    for (const el of scope.querySelectorAll("*")) {
      const cs = getComputedStyle(el);
      const l = parseFloat(cs.marginLeft) || 0;
      const r = parseFloat(cs.marginRight) || 0;
      const pl = parseFloat(cs.paddingLeft) || 0;
      const pr = parseFloat(cs.paddingRight) || 0;
      if (l > 0.5 || r > 0.5 || pl > 0.5 || pr > 0.5) {
        const cls = (el.className || "").toString().split(/\s+/).filter(Boolean).slice(0, 3).join(".");
        const key = `${el.tagName.toLowerCase()}.${cls}`;
        if (!counts.has(key)) counts.set(key, { key, l, r, pl, pr, count: 0 });
        counts.get(key).count += 1;
      }
    }
    return [...counts.values()].sort((a, b) => b.count - a.count).slice(0, 20);
  });
  console.log("=== " + token);
  for (const r of rows) console.log(JSON.stringify(r));
  await page.close();
}
await browser.disconnect();

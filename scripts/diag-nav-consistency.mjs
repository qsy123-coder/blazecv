// 检查各页面顶部导航是否完全一致（只有当前项的高亮不同）。
import puppeteer from "puppeteer-core";
import sharp from "sharp";

const browser = await puppeteer.connect({
  browserURL: process.env.CDP_URL ?? "http://127.0.0.1:9230",
  defaultViewport: { width: 1500, height: 1000, deviceScaleFactor: 1 },
  protocolTimeout: 120000,
});
const page = await browser.newPage();

const paths = ["/", "/templates", "/resumes"];
const rows = [];
for (const path of paths) {
  await page.goto(`http://127.0.0.1:3000${path}`, { waitUntil: "networkidle2", timeout: 60000 });
  await new Promise((r) => setTimeout(r, 1200));
  const info = await page.evaluate(() => {
    const header = document.querySelector("header");
    const rect = header?.getBoundingClientRect();
    const nav = header?.querySelector("nav");
    const items = nav
      ? [...nav.children].map((el) => ({
          tag: el.tagName,
          text: el.textContent?.trim(),
          current: el.getAttribute("aria-current"),
          color: getComputedStyle(el).color,
        }))
      : [];
    const cta = [...header.querySelectorAll("a")].map((a) => a.textContent?.trim()).filter(Boolean);
    const headerEl = header;
    return {
      height: rect ? Math.round(rect.height) : null,
      navItems: items,
      links: cta,
      headerHtmlShape: headerEl
        ? headerEl.innerHTML
            .replace(/aria-current="page"/g, "")
            .replace(/class="text-slate-900"/g, 'class="text-slate-500"')
            .replace(/\s+/g, " ")
            .slice(0, 400)
        : null,
    };
  });
  rows.push({ path, ...info });
  const el = await page.$("header");
  await el.screenshot({ path: `F:/Projects/blazecv/tools/audit/compare/NAV-${path === "/" ? "home" : path.slice(1)}.png` });
}
console.log(JSON.stringify(rows, null, 2));

const shape = rows.map((row) => row.headerHtmlShape);
console.log(JSON.stringify({ sameShape: shape.every((s) => s === shape[0]), heights: rows.map((r) => r.height) }));

// 像素差：active 项颜色不同，预期只有很小差异
for (let i = 1; i < rows.length; i += 1) {
  const left = await sharp(`F:/Projects/blazecv/tools/audit/compare/NAV-${rows[0].path === "/" ? "home" : rows[0].path.slice(1)}.png`).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const right = await sharp(`F:/Projects/blazecv/tools/audit/compare/NAV-${rows[i].path === "/" ? "home" : rows[i].path.slice(1)}.png`).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  let diff = 0;
  const n = Math.min(left.data.length, right.data.length);
  for (let k = 0; k < n; k += 1) diff += Math.abs(left.data[k] - right.data[k]);
  console.log(`${rows[0].path} vs ${rows[i].path}: meanDiff=${Math.round((diff / n) * 100) / 100}`);
}

await page.close();
await browser.disconnect();

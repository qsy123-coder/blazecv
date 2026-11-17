// 试验：给 .main 加左右 padding 后，全幅背景（绝对定位）和内容块的几何如何变化。
import puppeteer from "puppeteer-core";
import { mkdir } from "node:fs/promises";

const tokens = process.argv.slice(2);
if (tokens.length === 0) tokens = ["bbb107de5b600df0"];
const OUT = "F:/Projects/blazecv/tools/audit/margin-probe";
await mkdir(OUT, { recursive: true });

const browser = await puppeteer.connect({
  browserURL: process.env.CDP_URL ?? "http://127.0.0.1:9226",
  defaultViewport: { width: 900, height: 1300, deviceScaleFactor: 1 },
  protocolTimeout: 120000,
});

const measure = (page) =>
  page.evaluate(() => {
    const main = document.querySelector(".main");
    const inner = document.querySelector("#cv-container");
    const pick = (el) => {
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { x: Math.round(r.x), w: Math.round(r.width), cls: (el.className || "").toString().slice(0, 60) };
    };
    return {
      containerW: Math.round(inner.getBoundingClientRect().width),
      main: { ...pick(main), box: getComputedStyle(main).boxSizing, pad: getComputedStyle(main).padding },
      headerLine: pick(document.querySelector(".header-line")),
      pattern: pick(document.querySelector("img.cv-pattern")),
      cover: pick(document.querySelector(".cover")),
      user: pick(document.querySelector(".user")),
      content: pick(document.querySelector(".content")),
      firstOption: pick(document.querySelector(".content .option")),
      optionMargins: [...document.querySelectorAll(".content .option")]
        .slice(0, 4)
        .map((el) => {
          const cs = getComputedStyle(el);
          return { cls: el.className.toString().slice(0, 50), ml: cs.marginLeft, mr: cs.marginRight, pl: cs.paddingLeft, pr: cs.paddingRight };
        }),
    };
  });

for (const token of tokens) {
  const page = await browser.newPage();
  await page.setCacheEnabled(false);
  await page.goto(`http://127.0.0.1:3000/template-pages/${encodeURIComponent(token)}.html`, {
    waitUntil: "networkidle2",
    timeout: 60000,
  });
  const before = await measure(page);
  await page.screenshot({ path: `${OUT}/${token}-before.png`, fullPage: false });

  await page.evaluate(() => {
    const main = document.querySelector(".main");
    const cs = getComputedStyle(main);
    const left = Number.parseFloat(cs.paddingLeft) || 0;
    const right = Number.parseFloat(cs.paddingRight) || 0;
    main.style.setProperty("padding-left", `${left + 30}px`, "important");
    main.style.setProperty("padding-right", `${right + 30}px`, "important");
  });
  await new Promise((r) => setTimeout(r, 250));
  const after = await measure(page);
  await page.screenshot({ path: `${OUT}/${token}-after.png`, fullPage: false });

  console.log("=== " + token);
  console.log("before", JSON.stringify(before, null, 1));
  console.log("after ", JSON.stringify(after, null, 1));
  await page.close();
}
await browser.disconnect();

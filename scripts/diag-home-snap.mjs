// 验证首页首屏整屏 + 一次下滑进入模板市场 + 到顶后再上滑回首屏。
import puppeteer from "puppeteer-core";

const browser = await puppeteer.connect({
  browserURL: process.env.CDP_URL ?? "http://127.0.0.1:9255",
  defaultViewport: { width: 1500, height: 1000, deviceScaleFactor: 1 },
  protocolTimeout: 120000,
});
const page = await browser.newPage();
await page.goto("http://127.0.0.1:3000/", { waitUntil: "networkidle2", timeout: 60000 });
await new Promise((r) => setTimeout(r, 1200));
await page.mouse.move(760, 500);

async function state(label) {
  const data = await page.evaluate(() => {
    const hero = document.querySelector("section");
    const templates = document.querySelector("#templates");
    return {
      scrollY: Math.round(window.scrollY),
      viewport: window.innerHeight,
      heroTop: hero ? Math.round(hero.getBoundingClientRect().top) : null,
      heroBottom: hero ? Math.round(hero.getBoundingClientRect().bottom) : null,
      heroHeight: hero ? Math.round(hero.getBoundingClientRect().height) : null,
      templatesTop: templates ? Math.round(templates.getBoundingClientRect().top) : null,
      templatesAbsTop: templates
        ? Math.round(templates.getBoundingClientRect().top + window.scrollY)
        : null,
      headerHeight: Math.round(
        document.querySelector("header")?.getBoundingClientRect().height ?? 0,
      ),
    };
  });
  console.log(label, JSON.stringify(data));
  return data;
}

const initial = await state("initial");
await page.mouse.wheel({ deltaY: 120 });
await new Promise((r) => setTimeout(r, 1100));
const afterDown = await state("after one wheel down");

await page.mouse.wheel({ deltaY: 320 });
await new Promise((r) => setTimeout(r, 400));
const scrolledDown = await state("scrolled into templates");

await page.mouse.wheel({ deltaY: -320 });
await new Promise((r) => setTimeout(r, 400));
const backAtBoundary = await state("up near templates top");

await new Promise((r) => setTimeout(r, 250));
await page.mouse.wheel({ deltaY: -120 });
await new Promise((r) => setTimeout(r, 1100));
const afterUp = await state("after one more wheel up");

console.log(
  JSON.stringify({
    firstScreenFits:
      initial.headerHeight + initial.heroHeight === initial.viewport ||
      Math.abs(initial.headerHeight + initial.heroHeight - initial.viewport) <= 1,
    downSnapped: Math.abs(afterDown.scrollY - initial.templatesAbsTop) <= 2,
    upStoppedAtTop: Math.abs(backAtBoundary.scrollY - initial.templatesAbsTop) <= 2,
    upSnappedHome: afterUp.scrollY <= 2,
  }),
);

await page.close();
await browser.disconnect();

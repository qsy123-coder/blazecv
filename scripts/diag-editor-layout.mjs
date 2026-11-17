// 测量编辑页左侧内容高度与各卡片高度，评估“一屏内无滚动条”差多少。
import puppeteer from "puppeteer-core";

const widths = process.argv.slice(2).map(Number);
const viewports = widths.length ? widths : [400];
const browser = await puppeteer.connect({
  browserURL: process.env.CDP_URL ?? "http://127.0.0.1:9226",
  defaultViewport: { width: 1920, height: 1080 },
  protocolTimeout: 120000,
});

for (const width of viewports) {
  const page = await browser.newPage();
  await page.setCacheEnabled(false);
  await page.setViewport({ width: 1920, height: 1080, deviceScaleFactor: 1 });
  await page.goto(`http://127.0.0.1:3000/editor?cb=${Date.now()}`, { waitUntil: "networkidle2", timeout: 60000 });
  await page.waitForSelector("[data-resume-page]", { timeout: 30000 });
  await new Promise((r) => setTimeout(r, 1200));

  const info = await page.evaluate((w) => {
    const aside = document.querySelector("aside");
    if (!aside) return null;
    if (w) {
      aside.style.width = `${w}px`;
      aside.style.flex = `0 0 ${w}px`;
    }
    const cards = [...aside.querySelectorAll(".rounded-xl, .rounded-lg")].slice(0, 12).map((el) => {
      const r = el.getBoundingClientRect();
      const title = el.querySelector("h3, .text-\\[13px\\]")?.textContent?.slice(0, 20) ?? "";
      return { cls: el.className.toString().slice(0, 40), h: Math.round(r.height), title };
    });
    const inner = aside.querySelector(".space-y-3");
    return {
      viewport: { w: innerWidth, h: innerHeight },
      aside: {
        clientH: aside.clientHeight,
        scrollH: aside.scrollHeight,
        width: Math.round(aside.getBoundingClientRect().width),
        innerH: inner ? Math.round(inner.getBoundingClientRect().height) : null,
      },
      preview: (() => {
        const pane = document.querySelector("section.flex.min-w-0");
        const r = pane?.getBoundingClientRect();
        return r ? { w: Math.round(r.width), h: Math.round(r.height) } : null;
      })(),
      cards,
    };
  }, width);
  console.log("== aside width", width, JSON.stringify(info, null, 1).slice(0, 4000));
  await page.close();
}
await browser.disconnect();

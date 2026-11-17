import puppeteer from "puppeteer-core";

const browser = await puppeteer.connect({
  browserURL: process.env.CDP_URL ?? "http://127.0.0.1:9226",
  defaultViewport: { width: 1500, height: 1400, deviceScaleFactor: 1 },
  protocolTimeout: 120000,
});
const page = await browser.newPage();
await page.goto("http://127.0.0.1:3000/resumes", { waitUntil: "networkidle2", timeout: 60000 });
await new Promise((r) => setTimeout(r, 2500));
const info = await page.evaluate(() => {
  const cards = [...document.querySelectorAll("[data-resume-card]")];
  const frames = [...document.querySelectorAll("iframe")];
  const tall = [...document.querySelectorAll("body *")]
    .map((el) => ({
      tag: el.tagName,
      cls: typeof el.className === "string" ? el.className.slice(0, 80) : "",
      h: Math.round(el.getBoundingClientRect().height),
      w: Math.round(el.getBoundingClientRect().width),
    }))
    .filter((row) => row.h > 1200)
    .slice(0, 30);
  return {
    scrollHeight: document.documentElement.scrollHeight,
    bodyHeight: document.body.getBoundingClientRect().height,
    cards: cards.map((card) => {
      const rect = card.getBoundingClientRect();
      const frame = card.querySelector("iframe");
      const thumb = card.querySelector('[style*="height"]');
      return {
        title: card.querySelector("h2")?.textContent?.trim(),
        h: Math.round(rect.height),
        top: Math.round(rect.top + window.scrollY),
        frame: frame
          ? {
              title: frame.getAttribute("title"),
              rect: {
                w: Math.round(frame.getBoundingClientRect().width),
                h: Math.round(frame.getBoundingClientRect().height),
              },
              heightAttr: frame.getAttribute("height"),
              src: frame.getAttribute("src"),
            }
          : null,
        thumbH: thumb ? Math.round(thumb.getBoundingClientRect().height) : null,
      };
    }),
    frameCount: frames.length,
    tall,
  };
});
console.log(JSON.stringify(info, null, 2));
await page.screenshot({
  path: "F:/Projects/blazecv/tools/audit/compare/RESUMES-FULL.png",
  fullPage: true,
  captureBeyondViewport: true,
});
await page.close();
await browser.disconnect();

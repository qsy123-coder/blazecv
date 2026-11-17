import puppeteer from "puppeteer-core";

const token = process.argv[2] ?? "7035794f6173aa72";
const browser = await puppeteer.connect({
  browserURL: process.env.CDP_URL ?? "http://127.0.0.1:9227",
  defaultViewport: { width: 900, height: 1320, deviceScaleFactor: 1 },
});
const page = await browser.newPage();
await page.goto(`http://127.0.0.1:3000/audit?token=${encodeURIComponent(token)}`, {
  waitUntil: "networkidle2",
  timeout: 60000,
});
await page.waitForSelector('iframe[title="原站模板 1:1 预览"]', { timeout: 30000 });
await page.waitForFunction(
  () => document.querySelector("[data-audit-ready='1']"),
  { timeout: 30000 },
);
await new Promise((r) => setTimeout(r, 600));
const info = await page.evaluate(() => {
  const frame = document.querySelector('iframe[title="原站模板 1:1 预览"]');
  const doc = frame?.contentDocument;
  return {
    body: document.body.getBoundingClientRect().toJSON(),
    frame: frame?.getBoundingClientRect().toJSON(),
    mainStyle: doc?.querySelector(".main")?.getAttribute("style"),
    options: doc ? [...doc.querySelectorAll(".option")].filter((n) => getComputedStyle(n).display !== "none").length : 0,
    details: doc
      ? {
          mainH: doc.querySelector(".main")?.getBoundingClientRect().height,
          contentH: doc.querySelector(".content")?.getBoundingClientRect().height,
          scrollH: doc.querySelector(".content-scroll")?.scrollHeight,
          scrollClientH: doc.querySelector(".content-scroll")?.clientHeight,
          options: [...doc.querySelectorAll(".option")]
            .filter((n) => getComputedStyle(n).display !== "none")
            .map((n) => {
              const r = n.getBoundingClientRect();
              const c = n.querySelector(".menu-content-wrapper, .info-content");
              return {
                cls: [...n.classList].filter((x) => ["works", "personal_summary", "project_experience", "orgs", "honor", "extras", "custom"].includes(x)),
                top: Math.round(r.top),
                bottom: Math.round(r.bottom),
                h: Math.round(r.height),
                innerScroll: c?.scrollHeight,
                innerClient: c?.clientHeight,
              };
            }),
        }
      : null,
  };
});
console.log(JSON.stringify(info, null, 2));
const frame = await page.$('iframe[title="原站模板 1:1 预览"]');
if (frame) await frame.screenshot({ path: "C:/Users/WINDOWS11/AppData/Local/Temp/audit-one.png" });
await page.close();
browser.disconnect();

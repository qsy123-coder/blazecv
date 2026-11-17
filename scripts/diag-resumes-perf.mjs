// 量化「我的简历」打开耗时：首卡时间、缩略图完成时间、长任务、请求量。
import puppeteer from "puppeteer-core";

const browser = await puppeteer.connect({
  browserURL: process.env.CDP_URL ?? "http://127.0.0.1:9230",
  defaultViewport: { width: 1500, height: 1400, deviceScaleFactor: 1 },
  protocolTimeout: 180000,
});
const page = await browser.newPage();
const requests = { count: 0, bytes: 0, byType: {} };
page.on("response", async (response) => {
  requests.count += 1;
  try {
    const length = Number(response.headers()["content-length"] ?? 0);
    requests.bytes += length;
    const type = response.request().resourceType();
    requests.byType[type] = (requests.byType[type] ?? 0) + 1;
  } catch {
    /* ignore */
  }
});
page.on("console", (message) => {
  if (message.type() === "error") console.log("CONSOLE ERROR", message.text());
});

await page.evaluateOnNewDocument(() => {
  window.__timings = { longTasks: 0, longTaskMs: 0 };
  try {
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        window.__timings.longTasks += 1;
        window.__timings.longTaskMs += entry.duration;
      }
    }).observe({ type: "longtask", buffered: true });
  } catch {
    /* unsupported */
  }
});

const started = Date.now();
await page.goto("http://127.0.0.1:3000/resumes", { waitUntil: "domcontentloaded", timeout: 60000 });
await page.waitForSelector("[data-resume-card]", { timeout: 60000 });
const firstCard = Date.now() - started;
await page.waitForFunction(
  () => document.body.innerText.includes("份 · 数据保存在本机"),
  { timeout: 60000 },
);
const countReady = Date.now() - started;
let allBound = null;
for (let i = 0; i < 120; i += 1) {
  const state = await page.evaluate(() => ({
    cards: document.querySelectorAll("[data-resume-card]").length,
    frames: document.querySelectorAll("iframe").length,
    bound: [...document.querySelectorAll("iframe")].filter(
      (f) => !!f.contentDocument?.querySelector("#cv-container .user-name"),
    ).length,
  }));
  if (state.cards > 0 && state.frames >= state.cards && state.bound >= state.frames) {
    allBound = Date.now() - started;
    break;
  }
  if (i % 5 === 0) console.log("waiting", JSON.stringify({ t: Date.now() - started, ...state }));
  await new Promise((r) => setTimeout(r, 250));
}
const final = await page.evaluate(() => ({
  cards: document.querySelectorAll("[data-resume-card]").length,
  frames: document.querySelectorAll("iframe").length,
  bound: [...document.querySelectorAll("iframe")].filter(
    (f) => !!f.contentDocument?.querySelector("#cv-container .user-name"),
  ).length,
  timings: window.__timings,
  memory: performance.memory
    ? {
        usedMB: Math.round(performance.memory.usedJSHeapSize / 1048576),
        totalMB: Math.round(performance.memory.totalJSHeapSize / 1048576),
      }
    : null,
}));
console.log(
  JSON.stringify(
    { firstCardMs: firstCard, countReadyMs: countReady, allBoundMs: allBound, final, requests },
    null,
    2,
  ),
);
await page.close();
await browser.disconnect();

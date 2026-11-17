// 用大量简历复现「我的简历」页面的空白区域问题。
import puppeteer from "puppeteer-core";

const COUNT = Number(process.env.SEED_COUNT ?? 40);
const browser = await puppeteer.connect({
  browserURL: process.env.CDP_URL ?? "http://127.0.0.1:9230",
  defaultViewport: { width: 1500, height: 1400, deviceScaleFactor: 1 },
  protocolTimeout: 180000,
});
const page = await browser.newPage();

await page.goto("http://127.0.0.1:3000/resumes", { waitUntil: "networkidle2", timeout: 60000 });
let hasCatalog = await page.evaluate(
  () =>
    new Promise((resolve, reject) => {
      const open = indexedDB.open("blazecv");
      open.onerror = () => reject(open.error);
      open.onsuccess = () => {
        const db = open.result;
        const all = db.transaction("resumes", "readonly").objectStore("resumes").getAll();
        all.onsuccess = () => {
          resolve(all.result.some((row) => String(row.doc?.templateId ?? "").startsWith("wc")));
          db.close();
        };
        all.onerror = () => reject(all.error);
      };
    }),
);
console.log(`has catalog resume: ${hasCatalog}`);

if (!hasCatalog) {
  await page.goto("http://127.0.0.1:3000/templates", { waitUntil: "networkidle2", timeout: 60000 });
  await page.waitForSelector("[data-catalog-card]", { timeout: 30000 });
  const input = await page.$('input[aria-label="搜索模板"]');
  await input.type("应届生通用");
  await new Promise((r) => setTimeout(r, 800));
  await page.evaluate(() => {
    const card = [...document.querySelectorAll("[data-catalog-card]")].find((c) =>
      c.textContent.includes("应届生通用"),
    );
    [...(card?.querySelectorAll("button") ?? [])]
      .find((b) => b.textContent.includes("使用此模板"))
      ?.click();
  });
  await page.waitForFunction(() => location.pathname === "/editor", { timeout: 30000 });
  await page.waitForSelector("[data-resume-page]", { timeout: 30000 });
}

const seeded = await page.evaluate(async (count) => {
  const open = () =>
    new Promise((resolve, reject) => {
      const request = indexedDB.open("blazecv");
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);
    });
  const db = await open();
  const rows = await new Promise((resolve, reject) => {
    const request = db.transaction("resumes", "readonly").objectStore("resumes").getAll();
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  const base = rows.find((row) => String(row.doc?.templateId ?? "").startsWith("wc")) ?? rows[0];
  if (!base) return 0;
  const tx = db.transaction("resumes", "readwrite");
  const store = tx.objectStore("resumes");
  for (let i = 1; i < count; i += 1) {
    const doc = structuredClone(base.doc);
    doc.id = `resume_seed_${i}`;
    doc.title = `压力测试简历 ${i}`;
    doc.updatedAt = Date.now() - i * 1000;
    store.put({ id: doc.id, title: doc.title, updatedAt: doc.updatedAt, doc });
  }
  await new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
  return count - 1;
}, COUNT);
console.log(`seeded: ${seeded}`);

const started = Date.now();
await page.goto("http://127.0.0.1:3000/resumes", { waitUntil: "networkidle2", timeout: 120000 });
await new Promise((r) => setTimeout(r, 4000));
const info = await page.evaluate(() => {
  const cards = [...document.querySelectorAll("[data-resume-card]")];
  const frames = [...document.querySelectorAll("iframe")];
  const main = document.querySelector("main");
  const grid = cards[0]?.parentElement;
  const rect = (el) => {
    const r = el.getBoundingClientRect();
    return { top: Math.round(r.top + window.scrollY), h: Math.round(r.height), w: Math.round(r.width) };
  };
  return {
    cards: cards.length,
    iframes: frames.length,
    scrollHeight: document.documentElement.scrollHeight,
    viewport: window.innerHeight,
    grid: grid ? rect(grid) : null,
    main: main ? rect(main) : null,
    blankCards: cards.filter((card) => {
      const frame = card.querySelector("iframe");
      if (!frame) return false;
      const doc = frame.contentDocument;
      return !doc?.querySelector("#cv-container .user-name");
    }).length,
    firstFrames: frames.slice(0, 8).map((f) => ({
      title: f.getAttribute("title"),
      src: f.getAttribute("src"),
      rect: rect(f),
      bound: !!f.contentDocument?.querySelector("#cv-container .user-name"),
    })),
  };
});
console.log(JSON.stringify(info, null, 2));
console.log(`elapsed=${Date.now() - started}ms`);
await page.screenshot({
  path: "F:/Projects/blazecv/tools/audit/compare/RESUMES-MANY.png",
  fullPage: true,
  captureBeyondViewport: true,
});
await page.close();
await browser.disconnect();

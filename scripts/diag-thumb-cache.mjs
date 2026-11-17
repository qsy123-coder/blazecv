// 验证「我的简历」缩略图 IndexedDB 缓存：首次绑定后写入，二次打开直接 srcdoc 渲染。
import puppeteer from "puppeteer-core";

const browser = await puppeteer.connect({
  browserURL: process.env.CDP_URL ?? "http://127.0.0.1:9226",
  defaultViewport: { width: 1500, height: 1400, deviceScaleFactor: 1 },
  protocolTimeout: 180000,
});
const page = await browser.newPage();

async function clearCache() {
  await page.goto("http://127.0.0.1:3000/resumes", { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.evaluate(
    () =>
      new Promise((resolve, reject) => {
        const open = indexedDB.open("blazecv");
        open.onerror = () => reject(open.error);
        open.onsuccess = () => {
          const db = open.result;
          if (!db.objectStoreNames.contains("thumbs")) {
            db.close();
            resolve();
            return;
          }
          const tx = db.transaction("thumbs", "readwrite");
          tx.objectStore("thumbs").clear();
          tx.oncomplete = () => {
            db.close();
            resolve();
          };
          tx.onerror = () => reject(tx.error);
        };
      }),
  );
}

async function measure(label) {
  const requests = [];
  const onRequest = (request) => {
    const url = request.url();
    if (url.includes("/template-pages/")) requests.push(url.split("/").pop());
  };
  page.on("request", onRequest);
  const started = Date.now();
  await page.goto("http://127.0.0.1:3000/resumes", { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForSelector("[data-resume-card]", { timeout: 60000 });
  const firstCard = Date.now() - started;
  await page.waitForFunction(
    () => {
      const frame = document.querySelector('iframe[title="模板预览缩略图"]');
      return !!frame?.contentDocument?.querySelector("#cv-container .user-name");
    },
    { timeout: 60000 },
  );
  const rendered = Date.now() - started;
  await new Promise((r) => setTimeout(r, 800));
  page.off("request", onRequest);
  const state = await page.evaluate(
    () =>
      new Promise((resolve, reject) => {
        const open = indexedDB.open("blazecv");
        open.onerror = () => reject(open.error);
        open.onsuccess = () => {
          const db = open.result;
          const tx = db.transaction("thumbs", "readonly");
          const all = tx.objectStore("thumbs").getAll();
          all.onsuccess = () => {
            const rows = all.result;
            resolve({
              cacheRows: rows.length,
              cacheBytes: rows.reduce((sum, row) => sum + (row.html?.length ?? 0), 0),
              frames: [...document.querySelectorAll('iframe[title="模板预览缩略图"]')].map(
                (frame) => ({
                  hasSrcDoc: frame.hasAttribute("srcdoc"),
                  hasSrc: frame.hasAttribute("src"),
                  width: frame.getAttribute("width"),
                  height: frame.getAttribute("height"),
                  bound: !!frame.contentDocument?.querySelector("#cv-container .user-name"),
                }),
              ),
            });
            db.close();
          };
          all.onerror = () => reject(all.error);
        };
      }),
  );
  console.log(label, JSON.stringify({ firstCardMs: firstCard, renderedMs: rendered, templatePageRequests: requests, ...state }));
}

await clearCache();
await measure("cold");
await measure("warm");
await measure("warm2");

await page.close();
await browser.disconnect();

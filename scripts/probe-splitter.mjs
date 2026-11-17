// 验证编辑页左右分栏拖拽：宽度变化、列数切换、持久化、双击复位。
import puppeteer from "puppeteer-core";

const browser = await puppeteer.connect({
  browserURL: process.env.CDP_URL ?? "http://127.0.0.1:9226",
  defaultViewport: { width: 1600, height: 1000 },
  protocolTimeout: 120000,
});
const page = await browser.newPage();
await page.setCacheEnabled(false);
await page.setViewport({ width: 1600, height: 1000, deviceScaleFactor: 1 });
await page.goto(`http://127.0.0.1:3000/editor?cb=${Date.now()}`, { waitUntil: "networkidle2", timeout: 60000 });
await page.evaluate(() => {
  try {
    localStorage.removeItem("blazecv.editor-width");
  } catch {
    /* ignore */
  }
});
await page.reload({ waitUntil: "networkidle2", timeout: 60000 });
await page.waitForSelector("[data-resume-page]", { timeout: 30000 });
await page.waitForSelector('[role="separator"]', { timeout: 10000 });
await new Promise((r) => setTimeout(r, 800));

const state = () =>
  page.evaluate(() => {
    const aside = document.querySelector("aside");
    const cards = document.querySelector(".editor-cards");
    const sep = document.querySelector('[role="separator"]');
    const r = sep?.getBoundingClientRect();
    return {
      asideW: Math.round(aside.getBoundingClientRect().width),
      cols: getComputedStyle(cards).columnCount,
      scrollbar: aside.scrollHeight > aside.clientHeight,
      sep: r ? { x: r.x, y: r.y, w: r.width, h: r.height } : null,
      saved: (() => {
        try {
          return localStorage.getItem("blazecv.editor-width");
        } catch {
          return null;
        }
      })(),
    };
  });

const dragBy = async (dx) => {
  const s = await state();
  const startX = s.sep.x + s.sep.w / 2;
  const y = s.sep.y + Math.min(200, s.sep.h / 2);
  await page.mouse.move(startX, y);
  await page.mouse.down();
  await page.mouse.move(startX + dx, y, { steps: 8 });
  await page.mouse.up();
  await new Promise((r) => setTimeout(r, 400));
};

console.log("initial:", JSON.stringify(await state()));
await dragBy(200);
console.log("after +200:", JSON.stringify(await state()));
await dragBy(-500);
console.log("after -500:", JSON.stringify(await state()));

await page.reload({ waitUntil: "networkidle2", timeout: 60000 });
await page.waitForSelector("[data-resume-page]", { timeout: 30000 });
await new Promise((r) => setTimeout(r, 600));
console.log("after reload:", JSON.stringify(await state()));

// 双击复位（真实的 clickCount=1 + clickCount=2 序列才会合成 dblclick）
const s = await state();
const x = s.sep.x + s.sep.w / 2;
const y = s.sep.y + Math.min(200, s.sep.h / 2);
await page.mouse.move(x, y);
await page.mouse.down({ clickCount: 1 });
await page.mouse.up({ clickCount: 1 });
await page.mouse.down({ clickCount: 2 });
await page.mouse.up({ clickCount: 2 });
await new Promise((r) => setTimeout(r, 400));
console.log("after dblclick:", JSON.stringify(await state()));

// 键盘微调
await page.focus('[role="separator"]');
await page.keyboard.press("ArrowLeft");
await new Promise((r) => setTimeout(r, 300));
console.log("after ArrowLeft:", JSON.stringify(await state()));

await page.close();
await browser.disconnect();

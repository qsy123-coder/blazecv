// 采样 Tab 点击后 aside.scrollTop 的变化，判断 smooth 滚动是否被取消。
import puppeteer from "puppeteer-core";

const browser = await puppeteer.connect({
  browserURL: process.env.CDP_URL ?? "http://127.0.0.1:9227",
  defaultViewport: { width: 1600, height: 1000 },
  protocolTimeout: 120000,
});
const page = await browser.newPage();
await page.setCacheEnabled(false);
await page.setViewport({ width: 1600, height: 1000, deviceScaleFactor: 1 });
await page.goto(`http://127.0.0.1:3000/editor?cb=${Date.now()}`, { waitUntil: "networkidle2", timeout: 60000 });
await page.evaluate(() => localStorage.setItem("blazecv.editor-width", "420"));
await page.reload({ waitUntil: "networkidle2", timeout: 60000 });
await page.waitForSelector('[role="separator"]', { timeout: 30000 });
await new Promise((r) => setTimeout(r, 800));

await page.evaluate(() => {
  const aside = document.querySelector("aside");
  window.__scrollLog = [];
  aside.addEventListener("scroll", () => window.__scrollLog.push(Math.round(aside.scrollTop)));
  const btn = [...aside.querySelectorAll("button[aria-pressed]")].find(
    (b) => b.textContent?.trim() === "排版与主题",
  );
  btn?.click();
});
for (const delay of [100, 300, 600, 1000]) {
  await new Promise((r) => setTimeout(r, delay === 100 ? 100 : delay - (delay === 300 ? 100 : delay === 600 ? 300 : 600)));
  console.log(
    delay,
    JSON.stringify(
      await page.evaluate(() => ({
        top: Math.round(document.querySelector("aside").scrollTop),
        log: window.__scrollLog.slice(-6),
        active: [...document.querySelectorAll("aside button[aria-pressed]")]
          .filter((b) => b.getAttribute("aria-pressed") === "true")
          .map((b) => b.textContent?.trim()),
      })),
    ),
  );
}
await page.close();
await browser.disconnect();

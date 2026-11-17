// 多模板检查：编辑求职意向/所在城市后，右侧是否出现这两个值。
import puppeteer from "puppeteer-core";

const browser = await puppeteer.connect({
  browserURL: process.env.CDP_URL ?? "http://127.0.0.1:9243",
  defaultViewport: { width: 1600, height: 1100, deviceScaleFactor: 1 },
  protocolTimeout: 180000,
});
const list = await browser.newPage();
await list.goto("http://127.0.0.1:3000/resumes", { waitUntil: "networkidle2", timeout: 60000 });
const rows = await list.evaluate(
  () =>
    new Promise((resolve, reject) => {
      const open = indexedDB.open("blazecv");
      open.onerror = () => reject(open.error);
      open.onsuccess = () => {
        const db = open.result;
        const all = db.transaction("resumes", "readonly").objectStore("resumes").getAll();
        all.onsuccess = () => {
          resolve(
            all.result.map((row) => ({
              id: row.id,
              title: row.title,
              templateId: row.doc?.templateId,
              templateName: row.doc?.templatePreset?.name ?? "",
            })),
          );
          db.close();
        };
        all.onerror = () => reject(all.error);
      };
    }),
);
await list.close();
console.log("resumes:", JSON.stringify(rows, null, 2));

for (const row of rows) {
  const page = await browser.newPage();
  try {
    await page.goto(`http://127.0.0.1:3000/editor?id=${encodeURIComponent(row.id)}`, {
      waitUntil: "networkidle2",
      timeout: 60000,
    });
    await page.waitForSelector('iframe[title="原站模板 1:1 预览"]', { timeout: 30000 });
    await new Promise((r) => setTimeout(r, 1200));
    const changed = await page.evaluate(() => {
      const setInput = (labelText, value) => {
        const labelSpan = [...document.querySelectorAll("span.field-label")].find(
          (el) => el.textContent?.trim() === labelText,
        );
        const input = labelSpan?.closest("label")?.querySelector("input");
        if (!input) return false;
        const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")?.set;
        setter?.call(input, value);
        input.dispatchEvent(new Event("input", { bubbles: true }));
        return true;
      };
      return {
        job: setInput("求职意向", "TEST_JOB_123"),
        city: setInput("所在城市", "TEST_CITY_456"),
      };
    });
    await new Promise((r) => setTimeout(r, 1800));
    const state = await page.evaluate(() => {
      const doc = document.querySelector('iframe[title="原站模板 1:1 预览"]')?.contentDocument;
      const text = doc?.body?.innerText ?? "";
      const items = [...(doc?.querySelectorAll(".profile-item") ?? [])];
      return {
        changed: true,
        hasJob: text.includes("TEST_JOB_123"),
        hasCity: text.includes("TEST_CITY_456"),
        profileItems: items.length,
        visibleItems: items.filter((item) => getComputedStyle(item).display !== "none").length,
        userText: doc?.querySelector(".user")?.textContent?.replace(/\s+/g, " ").trim().slice(0, 180) ?? "",
      };
    });
    console.log(row.id, row.templateName || row.templateId, JSON.stringify({ ...changed, ...state }));
  } catch (error) {
    console.log(row.id, "ERR", String(error?.message ?? error).slice(0, 160));
  } finally {
    await page.close().catch(() => undefined);
  }
}

await browser.disconnect();

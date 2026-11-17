// 复现：编辑「求职意向 / 所在城市」后，右侧精确预览是否追加显示。
import puppeteer from "puppeteer-core";

const browser = await puppeteer.connect({
  browserURL: process.env.CDP_URL ?? "http://127.0.0.1:9230",
  defaultViewport: { width: 1600, height: 1100, deviceScaleFactor: 1 },
  protocolTimeout: 120000,
});
const page = await browser.newPage();
page.on("pageerror", (error) => console.log("PAGEERROR", error.message));
await page.goto("http://127.0.0.1:3000/editor?id=resume_seed_1", {
  waitUntil: "networkidle2",
  timeout: 60000,
});
await page.waitForSelector('iframe[title="原站模板 1:1 预览"]', { timeout: 30000 });
await new Promise((r) => setTimeout(r, 1500));

async function read(label) {
  const data = await page.evaluate(() => {
    const doc = document.querySelector('iframe[title="原站模板 1:1 预览"]')?.contentDocument;
    const items = [...(doc?.querySelectorAll(".profile-item") ?? [])].map((item) => ({
      display: getComputedStyle(item).display,
      text: item.textContent?.replace(/\s+/g, " ").trim(),
      html: item.innerHTML.slice(0, 500),
    }));
    const user = doc?.querySelector(".user");
    return {
      userText: user?.textContent?.replace(/\s+/g, " ").trim().slice(0, 300),
      items,
    };
  });
  console.log(label, JSON.stringify(data, null, 2));
}

await read("before");

// 找到「求职意向」「所在城市」标签后的输入框并写入
const changed = await page.evaluate(() => {
  const setInput = (labelText, value) => {
    const labelSpan = [...document.querySelectorAll("span.field-label")].find(
      (el) => el.textContent?.trim() === labelText,
    );
    const input =
      labelSpan?.closest("label")?.querySelector("input") ??
      labelSpan?.parentElement?.querySelector("input");
    if (!input) return false;
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")?.set;
    setter?.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
    return true;
  };
  return {
    job: setInput("求职意向", "前端开发工程师"),
    city: setInput("所在城市", "上海"),
    name: setInput("姓名", "陈媛媛Abbey"),
  };
});
console.log("inputs changed:", JSON.stringify(changed));
await new Promise((r) => setTimeout(r, 1800));
await read("after");

const stored = await page.evaluate(
  () =>
    new Promise((resolve, reject) => {
      const open = indexedDB.open("blazecv");
      open.onerror = () => reject(open.error);
      open.onsuccess = () => {
        const db = open.result;
        const get = db.transaction("resumes", "readonly").objectStore("resumes").get("resume_seed_1");
        get.onsuccess = () => {
          const row = get.result;
          resolve({
            basicsEdited: row?.doc?.basicsEdited,
            city: row?.doc?.basics?.city,
            jobTitle: row?.doc?.basics?.jobTitle,
            updatedAt: row?.doc?.updatedAt,
          });
          db.close();
        };
        get.onerror = () => reject(get.error);
      };
    }),
);
console.log("stored:", JSON.stringify(stored));

await page.close();
await browser.disconnect();

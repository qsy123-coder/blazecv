// 回归：经典模板（无 exact token，如 商务蓝）教育「补充」多行必须分行显示为圆点。
// 覆盖 blocks.tsx / TimelineLayout.tsx 的经典渲染器（exact 渲染器由 verify-edu-input.mjs 覆盖）。
import puppeteer from "puppeteer-core";

const doc = {
  schemaVersion: 1,
  id: `resume_verify_classic_${Date.now()}`,
  title: "经典模板·教育多行",
  templateId: "business",
  theme: { primary: "", fontScale: "md", lineHeight: 1.2, margin: 10 },
  basics: { name: "张三", jobTitle: "前端开发", phone: "", email: "", city: "", links: [] },
  sections: [
    {
      id: "probe_edu",
      type: "education",
      title: "教育经历",
      visible: true,
      items: [
        {
          id: "probe_edu_item",
          school: "示例大学",
          major: "计算机科学与技术",
          degree: "本科",
          start: "2018.09",
          end: "2022.06",
          detail: "GPA 3.9\n排名前5%\n三好学生",
        },
      ],
    },
  ],
  updatedAt: Date.now(),
};

const browser = await puppeteer.connect({
  browserURL: process.env.CDP_URL ?? "http://127.0.0.1:9226",
  defaultViewport: { width: 1500, height: 1300, deviceScaleFactor: 1 },
  protocolTimeout: 120000,
});
const page = await browser.newPage();
await page.setCacheEnabled(false);
await page.goto("http://127.0.0.1:3000/favicon.ico", { waitUntil: "domcontentloaded" }).catch(() => undefined);
await page.evaluate(async (record) => {
  const openDB = (version) =>
    new Promise((resolve, reject) => {
      const req = version ? indexedDB.open("blazecv", version) : indexedDB.open("blazecv");
      req.onupgradeneeded = () => {
        const d = req.result;
        if (!d.objectStoreNames.contains("resumes")) d.createObjectStore("resumes", { keyPath: "id" });
        if (!d.objectStoreNames.contains("settings")) d.createObjectStore("settings", { keyPath: "key" });
        if (!d.objectStoreNames.contains("versions")) d.createObjectStore("versions", { keyPath: "id", autoIncrement: true });
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  let db = await openDB();
  if (!db.objectStoreNames.contains("resumes") || !db.objectStoreNames.contains("settings")) {
    db.close();
    db = await openDB(2);
  }
  await new Promise((resolve, reject) => {
    const tx = db.transaction(["resumes", "settings"], "readwrite");
    tx.objectStore("resumes").put({ id: record.id, title: record.title, updatedAt: record.updatedAt, doc: record });
    tx.objectStore("settings").put({ key: "active-resume", value: record.id });
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}, doc);

await page.goto(`http://127.0.0.1:3000/editor?id=${encodeURIComponent(doc.id)}&cb=${Date.now()}`, {
  waitUntil: "networkidle2",
  timeout: 60000,
});
await page.waitForSelector("[data-resume-page]", { timeout: 30000 });
await new Promise((r) => setTimeout(r, 900));

const info = await page.evaluate(() => {
  const pageEl = document.querySelector("[data-resume-page]");
  const sec = pageEl?.querySelector("[data-section-id='probe_edu']");
  return {
    exact: !!document.querySelector('iframe[title="原站模板 1:1 预览"]'),
    text: sec?.innerText ?? "",
  };
});
console.log(JSON.stringify(info));
const lines = info.text
  .split("\n")
  .map((line) => line.replace(/^•\s*/, "").trim())
  .filter(Boolean);
const hasGpa = lines.some((line) => line === "GPA 3.9");
const hasRank = lines.some((line) => line === "排名前5%");
const hasHonor = lines.some((line) => line === "三好学生");
const ok = !info.exact && hasGpa && hasRank && hasHonor;
console.log(ok ? "PASS 经典模板补充按行显示" : "FAIL 经典模板补充未分行");
if (!ok) process.exitCode = 1;

const el = await page.$("[data-resume-page]");
if (el) await el.screenshot({ path: "tools/audit/compare/EDU-CLASSIC-VERIFY.png" }).catch(() => undefined);
await page.close();
await browser.disconnect();

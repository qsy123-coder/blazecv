// 澶嶇幇锛氭ā鏉挎湰韬病鏈夋暀鑲叉Ы浣嶆椂锛屻€屾坊鍔犳ā鍧?鈫?鏁欒偛銆嶅悗琛ュ厖鐨勫琛屾槸鍚︽覆鏌撴垚鏉＄洰銆?// usage: node scripts/probe-edu-add.mjs [token]
import puppeteer from "puppeteer-core";
import { readFile } from "node:fs/promises";

const ROOT = "F:/Projects/blazecv";
const token = process.argv[2] ?? "d9d0ec05a0515f93";
const catalog = JSON.parse(await readFile(`${ROOT}/public/template-catalog.json`, "utf8"));
const entry = catalog.templates.find((t) => t.token === token);
if (!entry) throw new Error(`no catalog entry for ${token}`);
const content = JSON.parse(await readFile(`${ROOT}/public/template-content/${token}.json`, "utf8"));
const education = {
  id: "probe_edu_added",
  type: "education",
  title: "鏁欒偛缁忓巻",
  visible: true,
  items: [
    {
      id: "probe_edu_item",
      school: "绀轰緥澶у",
      major: "璁＄畻鏈虹瀛︿笌鎶€鏈?,
      degree: "鏈",
      start: "2018.09",
      end: "2022.06",
      detail: "GPA 3.9 / 涓撲笟鍓?5%\n鏍＄骇涓夊ソ瀛︾敓\n鍥藉濂栧閲?,
    },
  ],
};
const doc = {
  schemaVersion: 1,
  id: `resume_probe_eduadd_${Date.now()}`,
  title: content.title ?? entry.name,
  templateId: `wcx-${token}`,
  templatePreset: {
    id: `wcx-${token}`,
    name: entry.name,
    layout: entry.layout,
    tags: entry.tags ?? [],
    source: { token, name: entry.sourceName ?? entry.name },
    base: entry.tokens ?? {},
  },
  theme: { primary: "", fontScale: "md", lineHeight: 1.2, margin: 10 },
  basics: { name: "", jobTitle: "", phone: "", email: "", city: "", links: [], ...(content.basics ?? {}) },
  sections: [...(content.sections ?? []), education],
  orderEdited: true,
  updatedAt: Date.now(),
};

const browser = await puppeteer.connect({
  browserURL: process.env.CDP_URL ?? "http://127.0.0.1:9226",
  defaultViewport: { width: 1500, height: 1400, deviceScaleFactor: 1 },
  protocolTimeout: 120000,
});
const page = await browser.newPage();\nawait page.setCacheEnabled(false);
await page.goto("http://127.0.0.1:3000/favicon.ico", { waitUntil: "domcontentloaded" }).catch(() => undefined);
await page.evaluate(async (record) => {
  const openDB = (version) =>
    new Promise((resolve, reject) => {
      const req = version ? indexedDB.open("blazecv", version) : indexedDB.open("blazecv");
      req.onupgradeneeded = () => {
        const d = req.result;
        ["resumes", "settings", "versions"].forEach((name, i) => {
          if (!d.objectStoreNames.contains(name)) {
            d.createObjectStore(name, i === 0 ? { keyPath: "id" } : i === 1 ? { keyPath: "key" } : { keyPath: "id", autoIncrement: true });
          }
        });
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  const db = await openDB();
  await new Promise((resolve, reject) => {
    const tx = db.transaction(["resumes", "settings"], "readwrite");
    tx.objectStore("resumes").put({ id: record.id, title: record.title, updatedAt: record.updatedAt, doc: record });
    tx.objectStore("settings").put({ key: "active-resume", value: record.id });
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}, doc);

await page.goto(`http://127.0.0.1:3000/editor?id=${encodeURIComponent(doc.id)}`, { waitUntil: "networkidle2", timeout: 60000 });
await page.waitForSelector('iframe[title="鍘熺珯妯℃澘 1:1 棰勮"]', { timeout: 30000 });
await new Promise((r) => setTimeout(r, 1500));

const preview = await page.evaluate(() => {
  const frame = document.querySelector('iframe[title="鍘熺珯妯℃澘 1:1 棰勮"]');
  const root = frame?.contentDocument?.querySelector("#cv-container");
  if (!root) return null;
  const options = [...root.querySelectorAll(".option")].map((opt) => ({
    cls: opt.className,
    title: opt.querySelector(".module-title-wrapper .title")?.textContent?.trim() ?? "",
    inner: opt.innerHTML.slice(0, 500),
    liTexts: [...opt.querySelectorAll(".menu-content li")].map((li) => li.textContent?.trim()),
    menuContentHtml: opt.querySelector(".menu-content")?.innerHTML?.slice(0, 300) ?? null,
  }));
  return { options, height: root.querySelector(".main")?.style.height ?? null, text: root.innerText.slice(-400) };
});
console.log(JSON.stringify(preview, null, 2));

const el = await page.$("[data-resume-page]");
if (el) {
  await el.screenshot({ path: "tools/audit/compare/EDU-ADD-P1.png" }).catch(() => undefined);
  console.log("saved tools/audit/compare/EDU-ADD-P1.png");
}
await page.close();
await browser.disconnect();


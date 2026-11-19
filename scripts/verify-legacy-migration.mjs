/**
 * 验证「已保存简历」的旧样例数据迁移（浏览器 IndexedDB 路径）。
 *
 * 做法：
 *   1. 打开编辑器，让应用创建/载入一份简历；
 *   2. 通过 IndexedDB 直接写入一份「带旧样例身份数据」的简历（模拟清洗前保存的记录）；
 *   3. 清掉迁移标记后刷新该简历 URL；
 *   4. 断言左侧姓名/邮箱/公司/头像已变为占位值，且数据库里也已更新。
 *
 * 前置：应用运行在 APP_URL，Edge CDP 可用。
 * 运行：CDP_URL=http://127.0.0.1:9227 node scripts/verify-legacy-migration.mjs
 */
import puppeteer from "puppeteer-core";

const BASE = (process.env.APP_URL ?? "http://127.0.0.1:3000").replace(/\/$/, "");
const CDP_URL = process.env.CDP_URL ?? "http://127.0.0.1:9227";

const results = [];
const check = (name, pass, detail = "") => {
  results.push({ name, pass, detail });
  console.log(`${pass ? "PASS" : "FAIL"} ${name}${detail ? ` — ${detail}` : ""}`);
};

const LEGACY_DOC = {
  schemaVersion: 1,
  id: "resume_legacy_test",
  title: "陈媛媛Abbey · 示例简历",
  templateId: "wcx-0187c1c62bb75ff4",
  templatePreset: {
    id: "wcx-0187c1c62bb75ff4",
    name: "超级简历模板 - 无实习经验",
    desc: "",
    layout: "single",
    source: { token: "0187c1c62bb75ff4", name: "超级简历模板 - 无实习经验" },
  },
  theme: { primary: "", fontScale: "md", lineHeight: 1.2, margin: 10 },
  basics: {
    name: "陈媛媛Abbey",
    jobTitle: "超级公司运营实习生",
    phone: "188-8888-8888",
    email: "abbey@wondercv.com",
    city: "北京",
    avatar:
      "https://staging-file-uploaded.oss-cn-beijing.aliyuncs.com/cv/cv_accounts/avatars/17730f50-6d16-11f0-993f-4f84990f60cd.jpeg",
    links: [],
  },
  sections: [
    {
      id: "s1",
      type: "experience",
      title: "工作经历",
      visible: true,
      items: [
        {
          id: "i1",
          org: "超级公司",
          role: "实习生",
          start: "2025.01",
          end: "2025.12",
          location: "北京",
          bullets: ["参与市场调研，收集和分析行业数据。"],
        },
      ],
    },
  ],
  updatedAt: Date.now(),
};

async function seedLegacyResume(page) {
  return page.evaluate(async (doc) => {
    const request = indexedDB.open("blazecv");
    const db = await new Promise((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    await new Promise((resolve, reject) => {
      const tx = db.transaction(["resumes", "settings"], "readwrite");
      tx.objectStore("resumes").put({
        id: doc.id,
        title: doc.title,
        updatedAt: doc.updatedAt,
        doc,
      });
      // 清掉迁移标记，模拟「首次运行迁移」
      tx.objectStore("settings").delete("legacy-scrub-v1");
      tx.oncomplete = () => resolve(null);
      tx.onerror = () => reject(tx.error);
    });
    db.close();
    return true;
  }, LEGACY_DOC);
}

async function readStoredDoc(page) {
  return page.evaluate(async () => {
    const request = indexedDB.open("blazecv");
    const db = await new Promise((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const record = await new Promise((resolve, reject) => {
      const tx = db.transaction(["resumes"], "readonly");
      const req = tx.objectStore("resumes").get("resume_legacy_test");
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    db.close();
    return record?.doc ?? null;
  });
}

const browser = await puppeteer.connect({ browserURL: CDP_URL, protocolTimeout: 120000 });
const page = await browser.newPage();
try {
  await page.setViewport({ width: 1600, height: 1000, deviceScaleFactor: 1 });
  await page.goto(`${BASE}/editor`, { waitUntil: "networkidle2", timeout: 60000 });
  await page.evaluate(() => new Promise((r) => setTimeout(r, 1200)));

  await seedLegacyResume(page);
  check("已写入带旧样例数据的简历", true, "resume_legacy_test");

  await page.goto(`${BASE}/editor?id=resume_legacy_test`, {
    waitUntil: "networkidle2",
    timeout: 60000,
  });
  await page.evaluate(() => new Promise((r) => setTimeout(r, 2000)));

  const stored = await readStoredDoc(page);
  const nameInput = await page.evaluate(() => {
    const inputs = [...document.querySelectorAll("input")];
    const byLabel = inputs.find((i) => i.getAttribute("aria-label") === "姓名");
    return byLabel?.value ?? null;
  });

  check("存储中的姓名已替换", stored?.basics?.name !== "陈媛媛Abbey", `name=${stored?.basics?.name}`);
  check("存储中的邮箱已替换", stored?.basics?.email !== "abbey@wondercv.com", `email=${stored?.basics?.email}`);
  check(
    "存储中的手机号已替换",
    stored?.basics?.phone !== "188-8888-8888",
    `phone=${stored?.basics?.phone}`,
  );
  check(
    "存储中的头像已改为本地",
    String(stored?.basics?.avatar ?? "").startsWith("/wondercv-assets/avatars/avatar-"),
    `avatar=${String(stored?.basics?.avatar ?? "").slice(0, 60)}`,
  );
  check(
    "存储中的公司名已替换",
    stored?.sections?.[0]?.items?.[0]?.org !== "超级公司",
    `org=${stored?.sections?.[0]?.items?.[0]?.org}`,
  );
  check(
    "标题已替换",
    !String(stored?.title ?? "").includes("陈媛媛"),
    `title=${stored?.title}`,
  );
  check("编辑器姓名输入框已同步", nameInput !== "陈媛媛Abbey", `input=${nameInput}`);

  const leftover = JSON.stringify(stored ?? {});
  check(
    "存储中不再含旧字样",
    !leftover.includes("陈媛媛") &&
      !leftover.includes("Abbey") &&
      !leftover.includes("wondercv.com") &&
      !leftover.includes("超级公司"),
    "",
  );
} finally {
  await page.close().catch(() => undefined);
  browser.disconnect();
}

const failed = results.filter((r) => !r.pass);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
if (failed.length) {
  console.error("FAILED:", failed.map((r) => r.name).join(" | "));
  process.exit(1);
}

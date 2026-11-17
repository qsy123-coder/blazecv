import puppeteer from "puppeteer-core";

const token = "d9d0ec05a0515f93";
const doc = {
  schemaVersion: 1,
  id: "x",
  title: "t",
  templateId: `wcx-${token}`,
  templatePreset: {
    id: `wcx-${token}`,
    name: "t",
    desc: "",
    layout: "banner",
    tags: [],
    base: { primary: "#4183ff", fontHead: "sans", fontBody: "sans" },
    source: { token, name: "t" },
  },
  theme: { primary: "", fontScale: "md", lineHeight: 1.2, margin: 10 },
  basics: { name: "测试", jobTitle: "", phone: "", email: "", city: "", links: [] },
  orderEdited: true,
  sections: [
    {
      id: "sec_edu",
      type: "education",
      title: "教育经历",
      visible: true,
      items: [
        {
          id: "edu1",
          school: "测试大学",
          major: "",
          degree: "",
          start: "",
          end: "",
          detail: "GPA 3.9\n排名前5%\n三好学生",
        },
      ],
    },
    {
      id: "sec_exp",
      type: "experience",
      title: "工作经历",
      visible: true,
      items: [
        {
          id: "exp1",
          org: "测试公司XYZ",
          role: "",
          start: "",
          end: "",
          location: "",
          bullets: [],
        },
      ],
    },
  ],
  updatedAt: Date.now(),
};
const b64 = Buffer.from(JSON.stringify(doc), "utf8").toString("base64");

const browser = await puppeteer.connect({
  browserURL: process.env.CDP_URL ?? "http://127.0.0.1:9226",
  defaultViewport: { width: 1000, height: 1400 },
  protocolTimeout: 120000,
});
const page = await browser.newPage();
await page.goto(`http://127.0.0.1:3000/audit?doc=${encodeURIComponent(b64)}`, {
  waitUntil: "domcontentloaded",
  timeout: 45000,
});
await page.waitForSelector('iframe[title="原站模板 1:1 预览"]', { timeout: 30000 });
await page.waitForFunction(() => document.querySelector("[data-audit-ready='1']"), { timeout: 45000 });
await page.evaluate(async () => window.__auditApply && (await window.__auditApply()));
await new Promise((r) => setTimeout(r, 800));

const info = await page.evaluate(() => {
  const f = document.querySelector('iframe[title="原站模板 1:1 预览"]');
  const d = f?.contentDocument;
  if (!d) return null;
  const edu = [...d.querySelectorAll(".option")].find(
    (o) => (o.querySelector(".module-title-wrapper .title")?.textContent || "").trim() === "教育经历",
  );
  const work = [...d.querySelectorAll(".option")].find(
    (o) => (o.querySelector(".module-title-wrapper .title")?.textContent || "").trim() === "工作经历",
  );
  const boldOf = (opt, needle) => {
    const els = opt ? [...opt.querySelectorAll(".font_w_b, b, strong")] : [];
    const hit = els.find((e) => (e.textContent || "").includes(needle));
    return hit
      ? {
          text: hit.textContent,
          weight: d.defaultView.getComputedStyle(hit).fontWeight,
          tag: hit.tagName,
        }
      : null;
  };
  return {
    eduText: edu ? (edu.textContent || "").replace(/\s+/g, " ").trim().slice(0, 120) : "",
    eduLi: edu ? edu.querySelectorAll(".menu-content ul li").length : 0,
    eduLiTexts: edu
      ? [...edu.querySelectorAll(".menu-content ul li")].map((li) => li.textContent)
      : [],
    schoolBold: boldOf(edu, "测试大学"),
    orgBold: boldOf(work, "测试公司XYZ"),
  };
});
console.log(JSON.stringify(info, null, 1));

const bulletsOk =
  info &&
  info.eduLi >= 3 &&
  info.eduLiTexts.some((t) => t.includes("GPA 3.9")) &&
  info.eduLiTexts.some((t) => t.includes("排名前5%")) &&
  info.eduLiTexts.some((t) => t.includes("三好学生"));
const boldOk =
  info &&
  info.schoolBold &&
  Number(info.schoolBold.weight) >= 600 &&
  info.orgBold &&
  Number(info.orgBold.weight) >= 600 &&
  info.orgBold.text.includes("测试公司XYZ");

console.log(`${bulletsOk ? "PASS" : "FAIL"} 教育补充按行显示为圆点条目`);
console.log(`${boldOk ? "PASS" : "FAIL"} 学校/公司保留加粗`);
await page.close();
browser.disconnect();

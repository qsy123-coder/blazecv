// 诊断：同一 doc 在「编辑页 iframe」与「/audit 导出渲染 iframe」中的布局坐标。
// 导出请求的 doc 从点击导出时拦截 /api/export-image 的 POST body 得到。
import puppeteer from "puppeteer-core";

const name = process.argv[2] ?? "2026用户运营应届生简历模板";
const CDP = process.env.CDP_URL ?? "http://127.0.0.1:9226";
const browser = await puppeteer.connect({
  browserURL: CDP,
  defaultViewport: { width: 1500, height: 1400, deviceScaleFactor: 2 },
  protocolTimeout: 240000,
});

function metricsScript() {
  const frame = document.querySelector('iframe[title="原站模板 1:1 预览"]');
  const d = frame?.contentDocument;
  if (!d) return { error: "no frame doc" };
  const rect = (el) => {
    if (!el) return null;
    const b = el.getBoundingClientRect();
    return { x: Math.round(b.x * 100) / 100, y: Math.round(b.y * 100) / 100, w: Math.round(b.width * 100) / 100, h: Math.round(b.height * 100) / 100 };
  };
  const cs = (el) => (el ? getComputedStyle(el) : null);
  const bodyCs = cs(d.body);
  return {
    iframeAttr: { width: frame.getAttribute("width"), height: frame.getAttribute("height") },
    iframeRect: rect(frame),
    innerSize: { w: frame.contentWindow.innerWidth, h: frame.contentWindow.innerHeight, dpr: frame.contentWindow.devicePixelRatio },
    docEl: { clientWidth: d.documentElement.clientWidth, scrollWidth: d.documentElement.scrollWidth, clientHeight: d.documentElement.clientHeight, scrollHeight: d.documentElement.scrollHeight },
    body: { clientWidth: d.body.clientWidth, scrollWidth: d.body.scrollWidth, margin: bodyCs.margin, padding: bodyCs.padding, zoom: bodyCs.zoom, transform: bodyCs.transform },
    html: { margin: cs(d.documentElement).margin, transform: cs(d.documentElement).transform, zoom: cs(d.documentElement).zoom },
    cv: rect(d.querySelector("#cv-container")),
    main: rect(d.querySelector(".main")),
    content: rect(d.querySelector(".content")),
    firstOption: rect(d.querySelector(".option")),
    h3: rect(d.querySelector(".option h3, .option .title")),
  };
}

async function openEditor() {
  const page = await browser.newPage();
  await page.goto("http://127.0.0.1:3000/templates", { waitUntil: "networkidle2", timeout: 60000 });
  await page.waitForSelector("[data-catalog-card]", { timeout: 30000 });
  const input = await page.$('input[aria-label="搜索模板"]');
  await input.type(name);
  await new Promise((r) => setTimeout(r, 700));
  await page.evaluate((n) => {
    const card = [...document.querySelectorAll("[data-catalog-card]")].find((c) => c.textContent.includes(n));
    [...(card?.querySelectorAll("button") ?? [])].find((b) => b.textContent.includes("使用此模板"))?.click();
  }, name);
  await page.waitForFunction(() => location.pathname === "/editor", { timeout: 30000 });
  await page.waitForSelector('iframe[title="原站模板 1:1 预览"]', { timeout: 30000 });
  await new Promise((r) => setTimeout(r, 1500));
  return page;
}

const editor = await openEditor();
let postData = null;
editor.on("request", (req) => {
  if (req.url().includes("/api/export-image") && req.method() === "POST") {
    postData = req.postData();
  }
});
const editorMetrics = await editor.evaluate(metricsScript);
const token = await editor.evaluate(() => {
  const f = document.querySelector('iframe[title="原站模板 1:1 预览"]');
  return (f?.getAttribute("src") ?? "").split("/").pop()?.replace(/\.html$/, "");
});

await editor.evaluate(() => { [...document.querySelectorAll("button")].find((b) => b.textContent?.trim() === "导出")?.click(); });
await new Promise((r) => setTimeout(r, 300));
await editor.evaluate(() => { [...document.querySelectorAll("button,[role=menuitem]")].find((b) => b.textContent?.includes("导出 PNG"))?.click(); });
for (let i = 0; i < 120 && !postData; i += 1) await new Promise((r) => setTimeout(r, 500));

if (!postData) {
  console.log(JSON.stringify({ name, token, error: "no export POST captured", editorMetrics }, null, 2));
  await editor.close();
  browser.disconnect();
  process.exit(0);
}

const doc = JSON.parse(postData).doc;
const audit = await browser.newPage();
await audit.goto(`http://127.0.0.1:3000/audit?doc=${encodeURIComponent(Buffer.from(JSON.stringify(doc)).toString("base64"))}`, { waitUntil: "domcontentloaded", timeout: 45000 });
await audit.waitForSelector('iframe[title="原站模板 1:1 预览"]', { timeout: 30000 });
await audit.waitForFunction(() => document.querySelector("[data-audit-ready='1']"), { timeout: 45000 }).catch(() => undefined);
await new Promise((r) => setTimeout(r, 1500));
const auditMetrics = await audit.evaluate(metricsScript);

console.log(JSON.stringify({ name, token, editorMetrics, auditMetrics }, null, 2));
await editor.close();
await audit.close();
browser.disconnect();

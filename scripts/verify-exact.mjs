import puppeteer from "puppeteer-core";

const APP_URL = process.env.APP_URL ?? "http://127.0.0.1:3000";
const CDP_URL = process.env.CDP_URL ?? "http://127.0.0.1:9226";
const samples = [
  { name: "应届生通用简历模板", expectAvatar: true },
  { name: "社会招聘通用简历模板", expectAvatar: true },
  { name: "实习生通用简历模板", expectAvatar: false },
];

const browser = await puppeteer.connect({
  browserURL: CDP_URL,
  defaultViewport: { width: 1440, height: 1000, deviceScaleFactor: 1 },
});
const page = await browser.newPage();
let failed = 0;
for (const sample of samples) {
  await page.goto(`${APP_URL}/templates`, { waitUntil: "networkidle2", timeout: 60000 });
  await page.waitForSelector("[data-catalog-card]", { timeout: 30000 });
  const input = await page.$('input[aria-label="搜索模板"]');
  await input.type(sample.name);
  await new Promise((r) => setTimeout(r, 700));
  const clicked = await page.evaluate((name) => {
    const card = [...document.querySelectorAll("[data-catalog-card]")].find((node) =>
      node.textContent.includes(name),
    );
    const button = [...(card?.querySelectorAll("button") ?? [])].find((node) =>
      node.textContent.includes("使用此模板"),
    );
    button?.click();
    return Boolean(button);
  }, sample.name);
  if (!clicked) {
    console.log(`FAIL ${sample.name} 未找到可点击模板`);
    failed += 1;
    continue;
  }
  await page.waitForFunction(() => location.pathname === "/editor", { timeout: 30000 });
  await page.waitForSelector('iframe[title="原站模板 1:1 预览"]', { timeout: 30000 });
  await new Promise((r) => setTimeout(r, 1500));
  const info = await page.evaluate(() => {
    const frame = document.querySelector('iframe[title="原站模板 1:1 预览"]');
    const doc = frame?.contentDocument;
    if (!doc) return null;
    const main = doc.querySelector(".main");
    const avatar = doc.querySelector(".user-avatar-image");
    const visible = [...doc.querySelectorAll(".option")].filter(
      (node) => getComputedStyle(node).display !== "none",
    );
    return {
      root: Boolean(doc.querySelector("#cv-container")),
      name: doc.querySelector(".user-name")?.textContent?.trim() ?? "",
      options: visible.length,
      height: Math.round(main?.getBoundingClientRect().height ?? 0),
      scrollHeight: doc.querySelector(".content-scroll")?.scrollHeight ?? 0,
      avatar:
        avatar instanceof HTMLImageElement
          ? avatar.getAttribute("src") ?? "none"
          : getComputedStyle(avatar ?? doc.body).backgroundImage,
      textLength: (doc.querySelector("#cv-container")?.textContent ?? "").trim().length,
    };
  });
  const ok =
    info &&
    info.root &&
    info.name.length > 0 &&
    info.options > 0 &&
    // Natural-height page: one A4 sheet is the floor, long resumes grow taller.
    info.height >= 1123 &&
    info.textLength > 40 &&
    (!sample.expectAvatar || info.avatar.includes("url("));
  console.log(
    `${ok ? "PASS" : "FAIL"} ${sample.name} · ${info?.name ?? "?"} · ${info?.options ?? 0} 模块 · ` +
      `${info?.height ?? 0}px · scroll=${info?.scrollHeight ?? 0} · ` +
      `${info?.textLength ?? 0} 字 · avatar=${info?.avatar ?? "?"}`,
  );
  if (!ok) failed += 1;
}
await page.close();
browser.disconnect();
process.exitCode = failed === 0 ? 0 : 1;

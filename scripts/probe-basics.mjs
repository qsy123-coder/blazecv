import puppeteer from "puppeteer-core";

const browser = await puppeteer.connect({
  browserURL: process.env.CDP_URL ?? "http://127.0.0.1:9226",
  defaultViewport: { width: 1500, height: 1300 },
  protocolTimeout: 120000,
});
const page = await browser.newPage();
await page.goto("http://127.0.0.1:3000/templates", { waitUntil: "networkidle2", timeout: 60000 });
await page.waitForSelector("[data-catalog-card]", { timeout: 30000 });
const input = await page.$('input[aria-label="搜索模板"]');
await input.type("Web3产品经理简历模板");
await new Promise((r) => setTimeout(r, 700));
await page.evaluate(() => {
  const card = [...document.querySelectorAll("[data-catalog-card]")].find((c) => c.textContent.includes("Web3产品经理"));
  [...(card?.querySelectorAll("button") ?? [])].find((b) => b.textContent.includes("使用此模板"))?.click();
});
await page.waitForFunction(() => location.pathname === "/editor", { timeout: 30000 });
await page.waitForSelector('iframe[title="原站模板 1:1 预览"]', { timeout: 30000 });
await new Promise((r) => setTimeout(r, 1600));

// list inputs with labels
const inputs = await page.evaluate(() =>
  [...document.querySelectorAll("input")]
    .filter((i) => i.type !== "file")
    .map((i) => {
      const wrap = i.closest("div");
      const label = (wrap?.parentElement?.textContent || "").replace(i.value, "").trim().slice(0, 12);
      return { label, value: i.value };
    }),
);
console.log("inputs", JSON.stringify(inputs.slice(0, 12)));

const setField = (label, value) =>
  page.evaluate(
    ({ label, value }) => {
      const ins = [...document.querySelectorAll("input")].filter((i) => i.type !== "file");
      const el = ins.find((i) => {
        const wrap = i.closest("div");
        const txt = (wrap?.parentElement?.textContent || "") + (wrap?.textContent || "");
        return txt.includes(label);
      });
      if (!el) return { ok: false };
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")?.set;
      setter?.call(el, value);
      el.dispatchEvent(new Event("input", { bubbles: true }));
      el.dispatchEvent(new Event("change", { bubbles: true }));
      return { ok: true, label: el.getAttribute("placeholder") || "" };
    },
    { label, value },
  );

console.log("setJob", JSON.stringify(await setField("求职意向", "测试意向ZZ")));
console.log("setCity", JSON.stringify(await setField("所在城市", "测试城市YY")));
await new Promise((r) => setTimeout(r, 1500));

const afterInputs = await page.evaluate(() =>
  [...document.querySelectorAll("input")].filter((i) => (i.value || "").includes("测试")).map((i) => i.value),
);
console.log("inputs with 测试", JSON.stringify(afterInputs));

const info = await page.evaluate(() => {
  const f = document.querySelector('iframe[title="原站模板 1:1 预览"]');
  const d = f?.contentDocument;
  const pi = d?.querySelector(".profile-item");
  const header = d?.querySelector(".user, .user-info, .header");
  return {
    profileText: pi?.textContent?.replace(/\s+/g, " ").slice(0, 120),
    profileChildren: pi?.children.length,
    headerText: header?.textContent?.replace(/\s+/g, " ").slice(0, 160),
    bodyHasJob: d?.body?.textContent?.includes("测试意向ZZ") ?? false,
    bodyHasCity: d?.body?.textContent?.includes("测试城市YY") ?? false,
  };
});
console.log("right", JSON.stringify(info));
await page.close();
browser.disconnect();

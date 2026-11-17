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
await new Promise((r) => setTimeout(r, 1800));

const titles = () =>
  page.evaluate(() => {
    const f = document.querySelector('iframe[title="原站模板 1:1 预览"]');
    const d = f?.contentDocument;
    return d
      ? [...d.querySelectorAll(".option")]
          .filter((o) => getComputedStyle(o).display !== "none")
          .map((o) => (o.querySelector(".module-title-wrapper .title")?.textContent || "").trim())
      : [];
  });
const bodyHas = (t) =>
  page.evaluate((x) => {
    const f = document.querySelector('iframe[title="原站模板 1:1 预览"]');
    return f?.contentDocument?.body?.textContent?.includes(x) ?? false;
  }, t);

const t = await titles();
console.log("titles", JSON.stringify(t));
console.log(`${t.some((x) => x.includes("技能")) && (await bodyHas("热爱Web3领域")) ? "PASS" : "FAIL"} 无「其它」时技能单独成模块`);

// edit 求职意向 / 所在城市
const setByPlaceholder = (placeholder, value) =>
  page.evaluate(
    ({ placeholder, value }) => {
      const el = document.querySelector(`input[placeholder="${placeholder}"]`);
      if (!el) return false;
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")?.set;
      setter?.call(el, value);
      el.dispatchEvent(new Event("input", { bubbles: true }));
      el.dispatchEvent(new Event("change", { bubbles: true }));
      return true;
    },
    { placeholder, value },
  );

const setJob = await setByPlaceholder("前端开发工程师", "测试意向ZZ");
const setCity = await setByPlaceholder("上海", "测试城市YY");
await new Promise((r) => setTimeout(r, 1500));
const showJob = await bodyHas("测试意向ZZ");
const showCity = await bodyHas("测试城市YY");
console.log(`${setJob && showJob ? "PASS" : "FAIL"} 求职意向显示 on右 set=${setJob} shown=${showJob}`);
console.log(`${setCity && showCity ? "PASS" : "FAIL"} 所在城市显示 on右 set=${setCity} shown=${showCity}`);

await page.close();
browser.disconnect();

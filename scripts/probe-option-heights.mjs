import puppeteer from "puppeteer-core";

const token = process.argv[2];
const browser = await puppeteer.connect({
  browserURL: process.env.CDP_URL ?? "http://127.0.0.1:9227",
  defaultViewport: { width: 900, height: 2600, deviceScaleFactor: 1 },
  protocolTimeout: 120000,
});
const page = await browser.newPage();

function collect() {
  const main = document.querySelector(".main");
  const opts = [...main.querySelectorAll(".option")].filter(
    (n) => getComputedStyle(n).display !== "none",
  );
  return opts.map((o) => {
    const r = o.getBoundingClientRect();
    return {
      cls: [...o.classList]
        .filter((c) =>
          ["works", "personal_summary", "project_experience", "orgs", "honor", "extras", "custom", "edus"].includes(c),
        )
        .join(","),
      h: Math.round(r.height * 10) / 10,
      items: [...o.querySelectorAll(".section-item-container")].map((it) => ({
        h: Math.round(it.getBoundingClientRect().height * 10) / 10,
        titles: [...it.querySelectorAll(".menu-title")].map(
          (t) => Math.round(t.getBoundingClientRect().height * 10) / 10,
        ),
        content: it.querySelector(".menu-content")
          ? Math.round(it.querySelector(".menu-content").getBoundingClientRect().height * 10) / 10
          : null,
        liCount: it.querySelectorAll(".menu-content li").length,
      })),
    };
  });
}

await page.goto(`http://127.0.0.1:3000/template-pages/${token}.html`, {
  waitUntil: "networkidle2",
  timeout: 60000,
});
await new Promise((r) => setTimeout(r, 450));
console.log("RAW:", JSON.stringify(await page.evaluate(collect), null, 1));

await page.goto(`http://127.0.0.1:3000/audit?token=${token}`, {
  waitUntil: "domcontentloaded",
  timeout: 60000,
});
await page.waitForSelector('iframe[title="原站模板 1:1 预览"]', { timeout: 30000 });
await page.waitForFunction(
  () => document.querySelector("[data-audit-ready='1']"),
  { timeout: 45000 },
);
await new Promise((r) => setTimeout(r, 700));
console.log(
  "BOUND:",
  JSON.stringify(
    await page.evaluate(() => {
      const frame = document.querySelector('iframe[title="原站模板 1:1 预览"]');
      const _doc = frame.contentDocument;
      const main = _doc.querySelector(".main");
      const opts = [...main.querySelectorAll(".option")].filter(
        (n) => getComputedStyle(n).display !== "none",
      );
      return opts.map((o) => {
        const r = o.getBoundingClientRect();
        return {
          cls: [...o.classList]
            .filter((c) =>
              ["works", "personal_summary", "project_experience", "orgs", "honor", "extras", "custom", "edus"].includes(c),
            )
            .join(","),
          h: Math.round(r.height * 10) / 10,
          items: [...o.querySelectorAll(".section-item-container")].map((it) => ({
            h: Math.round(it.getBoundingClientRect().height * 10) / 10,
            titles: [...it.querySelectorAll(".menu-title")].map(
              (t) => Math.round(t.getBoundingClientRect().height * 10) / 10,
            ),
            content: it.querySelector(".menu-content")
              ? Math.round(it.querySelector(".menu-content").getBoundingClientRect().height * 10) / 10
              : null,
            liCount: it.querySelectorAll(".menu-content li").length,
          })),
        };
      });
    }),
    null,
    1,
  ),
);
await page.close();
browser.disconnect();

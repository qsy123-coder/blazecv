import puppeteer from "puppeteer-core";

const tokens = process.argv.slice(2);
const browser = await puppeteer.connect({
  browserURL: process.env.CDP_URL ?? "http://127.0.0.1:9227",
  defaultViewport: { width: 900, height: 1400, deviceScaleFactor: 1 },
});
const page = await browser.newPage();
for (const token of tokens) {
  await page.goto(`http://127.0.0.1:3000/template-pages/${token}.html`, {
    waitUntil: "networkidle2",
    timeout: 60000,
  });
  await new Promise((r) => setTimeout(r, 600));
  const info = await page.evaluate(() => {
    const main = document.querySelector(".main");
    const content = document.querySelector(".content");
    const scroll = document.querySelector(".content-scroll");
    const options = [...document.querySelectorAll(".option")].filter(
      (n) => getComputedStyle(n).display !== "none",
    );
    const mainTop = main.getBoundingClientRect().top;
    let bottom = 0;
    for (const o of options) {
      bottom = Math.max(bottom, o.getBoundingClientRect().bottom - mainTop);
    }
    return {
      lineHeightStyle: main.style.lineHeight || null,
      lineHeightComputed: getComputedStyle(main).lineHeight,
      fontSize: getComputedStyle(main).fontSize,
      mainClass: main.className,
      mainH: Math.round(main.getBoundingClientRect().height),
      contentH: content ? Math.round(content.getBoundingClientRect().height) : null,
      scrollH: scroll ? scroll.scrollHeight : null,
      scrollClientH: scroll ? scroll.clientHeight : null,
      contentBottom: Math.round(bottom),
      options: options.map((o) => ({
        cls: [...o.classList].filter((x) =>
          ["works", "personal_summary", "project_experience", "orgs", "honor", "extras", "custom", "edus"].includes(x),
        ),
        h: Math.round(o.getBoundingClientRect().height),
      })),
    };
  });
  console.log(token, JSON.stringify(info));
}
await page.close();
browser.disconnect();

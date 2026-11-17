// 查看模板 .main 的直接子节点与头部/内容结构，决定水平页边距应该加在哪一层。
import puppeteer from "puppeteer-core";

const tokens = process.argv.slice(2);
if (tokens.length === 0) tokens.push("bbb107de5b600df0");

const browser = await puppeteer.connect({
  browserURL: process.env.CDP_URL ?? "http://127.0.0.1:9226",
  defaultViewport: { width: 900, height: 1300 },
  protocolTimeout: 120000,
});
for (const token of tokens) {
  const page = await browser.newPage();
  await page.setCacheEnabled(false);
  await page.goto(`http://127.0.0.1:3000/template-pages/${encodeURIComponent(token)}.html`, {
    waitUntil: "networkidle2",
    timeout: 60000,
  });
  const info = await page.evaluate(() => {
    const main = document.querySelector(".main");
    if (!main) return null;
    const describe = (el) => {
      const cs = getComputedStyle(el);
      const r = el.getBoundingClientRect();
      return {
        tag: el.tagName.toLowerCase(),
        cls: (el.className || "").toString().slice(0, 120),
        id: el.id || "",
        pos: cs.position,
        pad: cs.padding,
        margin: cs.margin,
        bg: cs.backgroundImage !== "none" ? "img" : cs.backgroundColor,
        w: Math.round(r.width),
        h: Math.round(r.height),
      };
    };
    const children = [...main.children].map(describe);
    const options = [...main.querySelectorAll(":scope > .option")].map(describe);
    const user = main.querySelector(".user, .user-info, .header, .person, .name-wrapper");
    return {
      main: describe(main),
      children,
      options,
      user: user ? describe(user) : null,
      firstOption: options[0] ?? null,
    };
  });
  console.log("=== " + token);
  console.log(JSON.stringify(info, null, 1).slice(0, 6000));
  await page.close();
}
await browser.disconnect();

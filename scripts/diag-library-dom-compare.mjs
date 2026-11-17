// 对比「我的简历」缩略图 iframe 与编辑器预览 iframe 的绑定后 DOM 是否完全一致。
import puppeteer from "puppeteer-core";

const browser = await puppeteer.connect({
  browserURL: process.env.CDP_URL ?? "http://127.0.0.1:9226",
  defaultViewport: { width: 1500, height: 1400, deviceScaleFactor: 2 },
  protocolTimeout: 120000,
});

async function snapshotFrame(page, frame) {
  return page.evaluate(async (frame) => {
    const doc = frame?.contentDocument;
    const root = doc?.querySelector("#cv-container");
    if (!doc || !root) return null;
    const html = root.outerHTML;
    const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(html));
    const hash = [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
    const main = root.querySelector(".main");
    const name = root.querySelector(".user-name");
    const option = root.querySelector(".option");
    return {
      src: frame.getAttribute("src"),
      srcDoc: frame.hasAttribute("srcdoc"),
      hash,
      htmlLength: html.length,
      textLength: root.innerText.length,
      frameCss: { width: frame.getBoundingClientRect().width, height: frame.getBoundingClientRect().height },
      mainStyle: main ? { height: getComputedStyle(main).height, width: getComputedStyle(main).width } : null,
      fontSize: option ? getComputedStyle(option).fontSize : null,
      name: name?.textContent?.trim() ?? "",
      fonts: doc.fonts?.status,
    };
  }, frame);
}

const library = await browser.newPage();
await library.goto("http://127.0.0.1:3000/resumes", { waitUntil: "networkidle2", timeout: 60000 });
await library.waitForSelector('iframe[title="模板预览缩略图"]', { timeout: 30000 });
await new Promise((r) => setTimeout(r, 1200));

const cardInfo = await library.evaluate(() => {
  const card = [...document.querySelectorAll("[data-resume-card]")].find((item) =>
    item.querySelector('iframe[title="模板预览缩略图"]'),
  );
  if (!card) return null;
  const frame = card.querySelector('iframe[title="模板预览缩略图"]');
  return {
    href: card.querySelector("a")?.getAttribute("href"),
    frame: frame ? true : false,
  };
});
if (!cardInfo?.href) throw new Error("no exact resume card found");
const thumbHandle = await library.evaluateHandle(() => {
  const card = [...document.querySelectorAll("[data-resume-card]")].find((item) =>
    item.querySelector('iframe[title="模板预览缩略图"]'),
  );
  return card?.querySelector('iframe[title="模板预览缩略图"]');
});
const thumb = await snapshotFrame(library, thumbHandle);

const editor = await browser.newPage();
await editor.goto(`http://127.0.0.1:3000${cardInfo.href}`, { waitUntil: "networkidle2", timeout: 60000 });
await editor.waitForSelector('iframe[title="原站模板 1:1 预览"]', { timeout: 30000 });
await new Promise((r) => setTimeout(r, 1200));
const editorHandle = await editor.$('iframe[title="原站模板 1:1 预览"]');
const preview = await snapshotFrame(editor, editorHandle);

console.log("thumb :", JSON.stringify(thumb, null, 2));
console.log("editor:", JSON.stringify(preview, null, 2));
console.log(
  JSON.stringify({
    sameSrc: (thumb?.src ?? null) === (preview?.src ?? null),
    sameDomHash: thumb?.hash === preview?.hash,
    sameName: thumb?.name === preview?.name,
    sameMainHeight: thumb?.mainStyle?.height === preview?.mainStyle?.height,
    thumbFromCache: thumb?.srcDoc === true,
  }),
);

await editor.close();
await library.close();
await browser.disconnect();

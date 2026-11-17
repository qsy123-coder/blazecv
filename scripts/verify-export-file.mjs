import puppeteer from "puppeteer-core";
import sharp from "sharp";
import { mkdtemp, readdir, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

// For each template name: export the REAL PNG file via the UI (fresh download
// dir per template), then render the untouched original page at natural height
// and compare the actual exported file against it.
const names = process.argv.slice(2);
const rootDir = await mkdtemp(path.join(tmpdir(), "blazecv-exportfile-"));
const browser = await puppeteer.connect({
  browserURL: process.env.CDP_URL ?? "http://127.0.0.1:9226",
  defaultViewport: { width: 1500, height: 1200, deviceScaleFactor: 1 },
  protocolTimeout: 180000,
});

function compare(a, b, w, h) {
  let sum = 0;
  let changed = 0;
  for (let i = 0; i < w * h; i += 1) {
    const o = i * 3;
    const d = Math.abs(a[o] - b[o]) + Math.abs(a[o + 1] - b[o + 1]) + Math.abs(a[o + 2] - b[o + 2]);
    sum += d;
    if (d > 30) changed += 1;
  }
  return {
    mean: Math.round((sum / (w * h * 3)) * 100) / 100,
    changedPct: Math.round((changed / (w * h)) * 1000) / 10,
  };
}

for (const [i, name] of names.entries()) {
  const dir = path.join(rootDir, `t${i}`);
  const { mkdir } = await import("node:fs/promises");
  await mkdir(dir, { recursive: true });
  const page = await browser.newPage();
  const cdp = await page.createCDPSession();
  await cdp.send("Page.setDownloadBehavior", { behavior: "allow", downloadPath: dir });

  await page.goto("http://127.0.0.1:3000/templates", { waitUntil: "networkidle2", timeout: 60000 });
  await page.waitForSelector("[data-catalog-card]", { timeout: 30000 });
  const input = await page.$('input[aria-label="搜索模板"]');
  await input.type(name);
  await new Promise((r) => setTimeout(r, 700));
  await page.evaluate((n) => {
    const card = [...document.querySelectorAll("[data-catalog-card]")].find((node) =>
      node.textContent.includes(n),
    );
    [...(card?.querySelectorAll("button") ?? [])]
      .find((node) => node.textContent.includes("使用此模板"))
      ?.click();
  }, name);
  await page.waitForFunction(() => location.pathname === "/editor", { timeout: 30000 });
  await page.waitForSelector('iframe[title="原站模板 1:1 预览"]', { timeout: 30000 });
  await new Promise((r) => setTimeout(r, 1300));
  const tokenFinal = await page.evaluate(() => {
    const f = document.querySelector('iframe[title="原站模板 1:1 预览"]');
    const src = f?.getAttribute("src") ?? "";
    return src.split("/").pop()?.replace(/\.html$/, "") ?? "";
  });
  const exportHeight = await page.evaluate(() => {
    const f = document.querySelector('iframe[title="原站模板 1:1 预览"]');
    return Math.round(f?.getBoundingClientRect().height ?? 0);
  });

  await page.evaluate(() => {
    [...document.querySelectorAll("button")]
      .find((b) => b.textContent?.trim() === "导出")
      ?.click();
  });
  await new Promise((r) => setTimeout(r, 300));
  await page.evaluate(() => {
    [...document.querySelectorAll("button, [role=menuitem]")]
      .find((b) => b.textContent?.includes("导出 PNG"))
      ?.click();
  });
  let png = null;
  for (let k = 0; k < 80; k += 1) {
    await new Promise((r) => setTimeout(r, 500));
    const files = await readdir(dir);
    png = files.find((f) => f.endsWith(".png"));
    if (png) break;
  }
  if (!png) {
    console.log(`${name}: EXPORT FAILED (no png)`);
    await page.close();
    continue;
  }
  const exportBuf = await readFile(path.join(dir, png));
  const em = await sharp(exportBuf).metadata();

  // Render the untouched original page at natural height.
  await page.goto(`http://127.0.0.1:3000/template-pages/${tokenFinal}.html`, {
    waitUntil: "domcontentloaded",
    timeout: 45000,
  });
  await page.waitForSelector("#cv-container", { timeout: 15000 }).catch(() => {});
  await new Promise((r) => setTimeout(r, 400));
  const rawH = await page.evaluate(async () => {
    const main = document.querySelector(".main");
    const content = document.querySelector(".content");
    const scroll = document.querySelector(".content-scroll");
    if (content) { content.style.height = "auto"; content.style.overflow = "visible"; }
    if (scroll) { scroll.style.height = "auto"; scroll.style.overflow = "visible"; }
    main.style.height = "auto";
    main.style.minHeight = "0";
    await document.fonts?.ready?.catch(() => {});
    const h = Math.max(1123, Math.ceil(main.getBoundingClientRect().height));
    main.style.height = `${h}px`;
    return h;
  });
  await new Promise((r) => setTimeout(r, 150));
  const rawEl = await page.$("#cv-container");
  const rawShot = await rawEl.screenshot({ type: "png" });

  const W = 794;
  const H = rawH;
  const exportResized = await sharp(exportBuf).resize(W, H, { fit: "fill" }).removeAlpha().raw().toBuffer();
  const rawData = await sharp(rawShot).resize(W, H, { fit: "fill" }).removeAlpha().raw().toBuffer();
  const m = compare(exportResized, rawData, W, H);
  const exportLogicalH = Math.round(em.height / 2);
  console.log(
    `${name}: token=${tokenFinal} exportFile=${em.width}x${em.height}(logical ${exportLogicalH}) rawH=${rawH} editorIframeH=${exportHeight}  mean=${m.mean} changed=${m.changedPct}%`,
  );

  const er = await sharp(exportBuf).resize(W, H, { fit: "fill" }).toBuffer();
  const rr = await sharp(rawShot).resize(W, H, { fit: "fill" }).toBuffer();
  await sharp({ create: { width: W * 2 + 20, height: H + 40, channels: 3, background: "#d0d4da" } })
    .composite([
      { input: rr, left: 0, top: 40 },
      { input: er, left: W + 20, top: 40 },
      {
        input: Buffer.from(
          `<svg width="${W * 2 + 20}" height="40"><text x="10" y="26" font-family="sans-serif" font-size="18" fill="#111">原站（左） vs 实际导出PNG（右） · ${name} · mean=${m.mean} · 高 ${rawH}/${exportLogicalH}</text></svg>`,
        ),
        left: 0,
        top: 0,
      },
    ])
    .png()
    .toFile(`F:/Projects/blazecv/tools/audit/compare/EXPORT-${tokenFinal}.png`);
  await page.close();
}
browser.disconnect();

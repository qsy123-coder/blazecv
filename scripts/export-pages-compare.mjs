// 编辑页「可见 A4 页」vs 真实导出 PNG「分页 A4」逐页对比（对齐感知版）。
//
// 背景：
//  - 编辑页预览：每页硬切 1123 CSS px（[data-resume-page] + offsetY=pageIndex*1123）。
//  - 导出 PNG：分页时会把断点吸附到附近空白行（±40 CSS px），末页补白。
//  - 因此第 2 页起内容会有几像素到几十像素的纵向错位；编辑页截图还可能因
//    预览面板居中/滚动条把页面外几像素背景裁进来（横向错位）。
//
// 对比方法：先用行/列暗像素投影求全局对齐偏移 (dx, dy)，再在共同区域内逐像素
// 计算残差。拉伸对比一律禁止。输出同时保留未对齐 mean，便于发现真实布局差异。
import puppeteer from "puppeteer-core";
import sharp from "sharp";
import { mkdtemp, readdir, readFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

const names = process.argv.slice(2);
const OUT = "F:/Projects/blazecv/tools/audit/compare";
await mkdir(OUT, { recursive: true });

const browser = await puppeteer.connect({
  browserURL: process.env.CDP_URL ?? "http://127.0.0.1:9226",
  defaultViewport: { width: 1500, height: 1500, deviceScaleFactor: 2 },
  protocolTimeout: 240000,
});

async function grayRaw(buf) {
  const { data, info } = await sharp(buf).grayscale().removeAlpha().raw().toBuffer({ resolveWithObject: true });
  return { data, w: info.width, h: info.height, ch: 1 };
}

async function rgbRaw(buf) {
  const { data, info } = await sharp(buf).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  return { data, w: info.width, h: info.height, ch: info.channels };
}

function compareRgbAligned(A, B, dx, dy) {
  const ch = 3;
  const W = A.w;
  const { data: a } = A;
  const b = B.data;
  const x0 = Math.max(0, dx);
  const x1 = Math.min(W, W + dx);
  const y0 = Math.max(0, dy);
  const y1 = Math.min(A.h, A.h + dy);
  let sum = 0;
  let changed = 0;
  let n = 0;
  for (let y = y0; y < y1; y += 1) {
    for (let x = x0; x < x1; x += 1) {
      const ai = (y * W + x) * ch;
      const bi = ((y - dy) * W + (x - dx)) * ch;
      const d0 = Math.abs(a[ai] - b[bi]);
      const d1 = Math.abs(a[ai + 1] - b[bi + 1]);
      const d2 = Math.abs(a[ai + 2] - b[bi + 2]);
      sum += d0 + d1 + d2;
      if (d0 + d1 + d2 > 30) changed += 1;
      n += 1;
    }
  }
  return {
    mean: Math.round((sum / Math.max(1, n * ch)) * 100) / 100,
    changedPct: Math.round((changed / Math.max(1, n)) * 1000) / 10,
  };
}

// 用二值暗像素掩码的余弦相似度做 2D 对齐：对稀疏页（第 2 页大面积为白）
// 比一维投影稳定，不会被空白行的并列最优带偏。
async function maskAt(buf, factor) {
  const { data, info } = await sharp(buf)
    .resize({ width: Math.max(1, Math.round(1588 / factor)), height: Math.max(1, Math.round(2246 / factor)), fit: "fill" })
    .grayscale()
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  return { data, w: info.width, h: info.height };
}

function maskScore(A, B, dx, dy) {
  const x0 = Math.max(0, dx);
  const x1 = Math.min(A.w, A.w + dx);
  const y0 = Math.max(0, dy);
  const y1 = Math.min(A.h, A.h + dy);
  let inter = 0;
  let ca = 0;
  let cb = 0;
  for (let y = y0; y < y1; y += 1) {
    for (let x = x0; x < x1; x += 1) {
      const av = A.data[y * A.w + x] < 230 ? 1 : 0;
      const bv = B.data[(y - dy) * B.w + (x - dx)] < 230 ? 1 : 0;
      if (av && bv) inter += 1;
      ca += av;
      cb += bv;
    }
  }
  if (ca === 0 || cb === 0) return 0;
  return inter / Math.sqrt(ca * cb);
}

async function alignImages(bufA, bufB) {
  const A4 = await maskAt(bufA, 4);
  const B4 = await maskAt(bufB, 4);
  let best = { dx: 0, dy: 0, score: -1 };
  for (let dy = -23; dy <= 23; dy += 1) {
    for (let dx = -4; dx <= 4; dx += 1) {
      const s = maskScore(A4, B4, dx, dy);
      if (s > best.score) best = { dx, dy, score: s };
    }
  }
  let dx0 = best.dx * 4;
  let dy0 = best.dy * 4;
  // 1/2 精度细化
  const A2 = await maskAt(bufA, 2);
  const B2 = await maskAt(bufB, 2);
  let fine = { dx: dx0, dy: dy0, score: -1 };
  for (let dy = dy0 - 6; dy <= dy0 + 6; dy += 2) {
    for (let dx = dx0 - 6; dx <= dx0 + 6; dx += 2) {
      const s = maskScore(A2, B2, Math.round(dx / 2), Math.round(dy / 2));
      if (s > fine.score) fine = { dx, dy, score: s };
    }
  }
  return { dx: Math.max(-16, Math.min(16, fine.dx)), dy: Math.max(-90, Math.min(90, fine.dy)) };
}

function compareRegion(A, B, dx, dy) {
  const { data: a, w: W, h: H } = A;
  const b = B.data;
  const x0 = Math.max(0, dx);
  const x1 = Math.min(W, W + dx);
  const y0 = Math.max(0, dy);
  const y1 = Math.min(H, H + dy);
  let sum = 0;
  let changed = 0;
  let n = 0;
  for (let y = y0; y < y1; y += 1) {
    for (let x = x0; x < x1; x += 1) {
      const av = a[y * W + x];
      const bv = b[(y - dy) * W + (x - dx)];
      const d = av - bv;
      const ad = d < 0 ? -d : d;
      sum += ad;
      if (ad > 30) changed += 1;
      n += 1;
    }
  }
  return {
    mean: Math.round((sum / Math.max(1, n)) * 100) / 100,
    changedPct: Math.round((changed / Math.max(1, n)) * 1000) / 10,
  };
}

function numberedPages(files) {
  return files
    .filter((f) => /-p\d+-/.test(f))
    .sort((x, y) => Number(x.match(/-p(\d+)-/)[1]) - Number(y.match(/-p(\d+)-/)[1]));
}

const rows = [];
for (const [i, name] of names.entries()) {
  const dir = await mkdtemp(path.join(tmpdir(), `blazecv-pg3-${i}-`));
  const page = await browser.newPage();
  const cdp = await page.createCDPSession();
  await cdp.send("Page.setDownloadBehavior", { behavior: "allow", downloadPath: dir });
  try {
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
    await new Promise((r) => setTimeout(r, 1600));

    const token = await page.evaluate(() => {
      const f = document.querySelector('iframe[title="原站模板 1:1 预览"]');
      return (f?.getAttribute("src") ?? "").split("/").pop()?.replace(/\.html$/, "");
    });
    const cssH = await page.evaluate(() =>
      Number(document.querySelector('iframe[title="原站模板 1:1 预览"]')?.getAttribute("height") ?? 0),
    );
    const expectedPages = Math.max(1, Math.ceil((cssH - 20) / 1123));
    await page.waitForFunction(
      (n) => document.querySelectorAll("[data-resume-page]").length >= n,
      { timeout: 30000 },
      expectedPages,
    );

    const pageEls = await page.$$("[data-resume-page]");
    const editorPages = [];
    for (let p = 0; p < Math.min(pageEls.length, expectedPages); p += 1) {
      editorPages.push(await pageEls[p].screenshot({ type: "png" }));
    }

    await page.evaluate(() => { [...document.querySelectorAll("button")].find((b) => b.textContent?.trim() === "导出")?.click(); });
    await new Promise((r) => setTimeout(r, 300));
    await page.evaluate(() => { [...document.querySelectorAll("button,[role=menuitem]")].find((b) => b.textContent?.includes("导出 PNG"))?.click(); });

    let files = [];
    let stableSince = 0;
    for (let k = 0; k < 160; k += 1) {
      await new Promise((r) => setTimeout(r, 400));
      files = await readdir(dir);
      const numbered = numberedPages(files);
      const singles = files.filter((f) => f.endsWith(".png") && !/-p\d+-/.test(f));
      const found = Math.max(numbered.length, singles.length > 0 ? 1 : 0);
      if (found >= expectedPages) {
        if (stableSince === 0) stableSince = Date.now();
        else if (Date.now() - stableSince > 1200) break;
      }
    }
    const numbered = numberedPages(files);
    const singles = files.filter((f) => f.endsWith(".png") && !/-p\d+-/.test(f));
    const pageFiles = numbered.length > 0 ? numbered : singles;
    if (pageFiles.length === 0 || editorPages.length === 0) {
      rows.push({ name, token, error: `no png (editorPages=${editorPages.length}, exportFiles=${pageFiles.length})` });
      console.log(`${name}: EXPORT FAILED`);
      continue;
    }

    const pageRows = [];
    let totalSum = 0;
    let totalPixels = 0;

    for (let p = 0; p < Math.min(editorPages.length, pageFiles.length); p += 1) {
      const exportBuf = await readFile(path.join(dir, pageFiles[p]));
      const A = await grayRaw(editorPages[p]);
      const B = await grayRaw(exportBuf);
      const W = Math.min(A.w, B.w);
      const H = Math.min(A.h, B.h);
      // 统一到相同尺寸（只裁剪，不缩放）。手工按行裁剪，避免 sharp raw 通道转换。
      const cropGray = (img) => {
        if (img.w === W && img.h === H) return img;
        const data = Buffer.allocUnsafe(W * H);
        for (let y = 0; y < H; y += 1) {
          img.data.copy(data, y * W, y * img.w, y * img.w + W);
        }
        return { data, w: W, h: H };
      };
      const a = cropGray(A);
      const b = cropGray(B);
      const { dx, dy } = await alignImages(editorPages[p], exportBuf);
      const grayAligned = compareRegion(a, b, dx, dy);
      const grayZero = compareRegion(a, b, 0, 0);

      // RGB 口径（与项目审计阈值一致）
      const AC = await rgbRaw(editorPages[p]);
      const BC = await rgbRaw(exportBuf);
      const cropRgb = (img) => {
        if (img.w === W && img.h === H) return img;
        const ch = 3;
        const data = Buffer.allocUnsafe(W * H * ch);
        for (let y = 0; y < H; y += 1) {
          img.data.copy(data, y * W * ch, y * img.w * ch, y * img.w * ch + W * ch);
        }
        return { data, w: W, h: H, ch };
      };
      const rgbAligned = compareRgbAligned(cropRgb(AC), cropRgb(BC), dx, dy);
      const rgbZero = compareRgbAligned(cropRgb(AC), cropRgb(BC), 0, 0);

      if (rgbAligned.mean > 20) {
        await import("node:fs/promises").then(({ writeFile }) =>
          writeFile(path.join(OUT, `DEBUG-EDITOR-${token}-p${p + 1}.png`), editorPages[p]),
        ).catch(() => undefined);
        console.log(`DEBUG ${name} p${p + 1}: file=${pageFiles[p]} dims A=${A.w}x${A.h} B=${B.w}x${B.h} crop=${W}x${H} dx=${dx} dy=${dy} rgb=${rgbAligned.mean} gray=${grayAligned.mean}`);
      }
      pageRows.push({
        page: p + 1,
        offsetCss: { dx: dx / 2, dy: dy / 2 },
        mean: rgbAligned.mean,
        changedPct: rgbAligned.changedPct,
        meanNoAlign: rgbZero.mean,
        grayMean: grayAligned.mean,
      });
      totalSum += rgbAligned.mean * W * H;
      totalPixels += W * H;

      const aligned = { mean: rgbAligned.mean };

      // 每页都保存对比图，便于人工核对。
      {
        const left = await sharp(editorPages[p]).extract({ left: Math.max(0, dx), top: Math.max(0, dy), width: W - Math.abs(dx), height: H - Math.abs(dy) }).png().toBuffer();
        const right = await sharp(await readFile(path.join(dir, pageFiles[p]))).extract({ left: Math.max(0, -dx), top: Math.max(0, -dy), width: W - Math.abs(dx), height: H - Math.abs(dy) }).png().toBuffer();
        const m2 = await sharp(left).metadata();
        await sharp({ create: { width: m2.width * 2 + 20, height: m2.height + 40, channels: 3, background: "#d0d4da" } })
          .composite([
            { input: left, left: 0, top: 40 },
            { input: right, left: m2.width + 20, top: 40 },
            { input: Buffer.from(`<svg width="${m2.width * 2 + 20}" height="40"><text x="10" y="26" font-family="sans-serif" font-size="18" fill="#111">编辑页第${p + 1}页(左) vs 导出第${p + 1}页(右) · ${name} · mean=${aligned.mean} offset=(${dx / 2},${dy / 2})css</text></svg>`), left: 0, top: 0 },
          ])
          .png()
          .toFile(path.join(OUT, `PAGES-${token}-p${p + 1}.png`));
      }
    }

    const overall = Math.round((totalSum / Math.max(1, totalPixels)) * 100) / 100;
    rows.push({
      name,
      token,
      cssH,
      expectedPages,
      exportedPages: pageFiles.length,
      editorPages: editorPages.length,
      pages: pageRows,
      mean: overall,
    });
    console.log(`${name}: token=${token} cssH=${cssH} pages=${pageFiles.length}/${expectedPages} mean=${overall} | ` + pageRows.map((r) => `p${r.page}: mean=${r.mean} off=(${r.offsetCss.dx},${r.offsetCss.dy})css noAlign=${r.meanNoAlign}`).join(" ; "));
  } catch (e) {
    rows.push({ name, error: String(e?.message ?? e).slice(0, 160) });
    console.log(`${name}: ERR ${String(e?.message ?? e).slice(0, 160)}`);
  } finally {
    await page.close().catch(() => undefined);
  }
}

console.log("\nSUMMARY");
for (const r of rows) console.log(JSON.stringify(r));
await browser.disconnect();

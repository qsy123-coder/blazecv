// 批量「真实导出 PNG vs 编辑页分页预览」对比。
//
// 特点：
//  - 直接构造 ResumeDoc 写入 IndexedDB，再打开 /editor?id=，跳过模板库搜索/点卡片。
//  - 自带一个独立无头 Edge（默认 9333 端口、.edge-batch 配置），每 N 个模板主动重启；
//    崩溃（Target closed / detached Frame）时自动重启并重试当前模板一次。
//  - 服务端 /api/export-image 走 EXPORT_CHROME_PATH 按需拉起（批处理开始前请停掉 9226/9227，
//    否则 route 会优先连它们）。
//  - 逐页对齐后算 RGB 残差；只裁剪不拉伸。结果追加到 JSONL，支持断点续跑。
//
// 用法：
//   set BATCH_START=0 & set BATCH_LIMIT=100 & node scripts/export-batch.mjs
//   set BATCH_TOKENS=token1,token2 & node scripts/export-batch.mjs
// 环境变量：BATCH_START/BATCH_LIMIT/BATCH_TOKENS/BATCH_CDP_PORT/BATCH_RESTART_EVERY/
//           BATCH_OUT/BATCH_RETRY_FAILED/BATCH_RESTART_SERVER(默认1)
import puppeteer from "puppeteer-core";
import sharp from "sharp";
import { spawn, execSync } from "node:child_process";
import { mkdir, readFile, readdir, writeFile, appendFile, rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";

sharp.cache(false);
sharp.concurrency(1);

const ROOT = "F:/Projects/blazecv";
const OUT = process.env.BATCH_OUT ?? path.join(ROOT, "tools/audit/export-batch");
const RESULTS = path.join(OUT, "results.jsonl");
const SUMMARY = path.join(OUT, "summary.json");
const IMAGES = path.join(OUT, "flagged");
const EDGE = process.env.EXPORT_CHROME_PATH ?? "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
const PORT = Number(process.env.BATCH_CDP_PORT ?? 9333);
// 左栏宽度是 clamp(420px, 60vw, 1100px)。1500 视口时预览只剩 ~600px 会被缩到
// 0.675，导致对比缩放失真；2000 宽时左栏封顶 1100，预览保持 1:1（1588 截图）。
const VIEW_W = Number(process.env.BATCH_VIEWPORT_WIDTH ?? 2000);
const VIEW_H = Number(process.env.BATCH_VIEWPORT_HEIGHT ?? 1200);
const PROFILE = path.join(ROOT, ".edge-batch");
const RESTART_EVERY = Number(process.env.BATCH_RESTART_EVERY ?? 40);
const RETRY_FAILED = process.env.BATCH_RETRY_FAILED === "1";
const ORIGIN = "http://127.0.0.1:3000";

await mkdir(OUT, { recursive: true });
await mkdir(IMAGES, { recursive: true });

const catalog = JSON.parse(await readFile(path.join(ROOT, "public/template-catalog.json"), "utf8"));
const byToken = new Map(catalog.templates.map((t) => [t.token, t]));

let tokens;
if (process.env.BATCH_TOKENS) {
  tokens = process.env.BATCH_TOKENS.split(",").map((s) => s.trim()).filter(Boolean);
} else {
  const start = Number(process.env.BATCH_START ?? 0);
  const limit = Number(process.env.BATCH_LIMIT ?? 100);
  tokens = catalog.templates.slice(start, start + limit).map((t) => t.token);
}

// ---------- 结果/断点 ----------
const done = new Set();
const attempts = new Map();
if (existsSync(RESULTS)) {
  const text = await readFile(RESULTS, "utf8");
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim()) continue;
    try {
      const row = JSON.parse(line);
      attempts.set(row.token, (attempts.get(row.token) ?? 0) + 1);
      // 成功即跳过；失败最多重试 3 次，避免永久坏模板拖住整批。
      if (row.status === "ok" || attempts.get(row.token) >= 3) done.add(row.token);
      else if (RETRY_FAILED) done.delete(row.token);
    } catch {
      /* 忽略损坏行 */
    }
  }
}
const todo = tokens.filter((t) => !done.has(t));
console.log(`batch: total=${tokens.length} done=${tokens.length - todo.length} todo=${todo.length} out=${OUT}`);

// ---------- 服务端自愈 ----------
function listenerPid(port) {
  try {
    const out = execSync("netstat -ano -p tcp", { encoding: "latin1" });
    for (const line of out.split(/\r?\n/)) {
      if (line.includes(`:${port}`) && /LISTENING/i.test(line)) {
        const parts = line.trim().split(/\s+/);
        return Number(parts[parts.length - 1]);
      }
    }
  } catch {
    /* ignore */
  }
  return 0;
}

async function serverUp() {
  try {
    const res = await fetch(`${ORIGIN}/templates`, { method: "GET", signal: AbortSignal.timeout(2500) });
    return res.ok;
  } catch {
    return false;
  }
}

let serverChild = null;
async function ensureServer(force = false) {
  if (!force && (await serverUp())) return;
  if (force) {
    const pid = listenerPid(3000);
    if (pid) {
      try { execSync(`taskkill /PID ${pid} /T /F`, { stdio: "ignore" }); } catch { /* ignore */ }
    }
  }
  const env = { ...process.env, EXPORT_CHROME_PATH: EDGE };
  delete env.EXPORT_CDP_URL;
  serverChild = spawn("cmd.exe", ["/c", "npm run start > .next-server.log 2>&1"], {
    cwd: ROOT,
    env,
    detached: true,
    stdio: "ignore",
    windowsHide: true,
  });
  serverChild.unref();
  for (let i = 0; i < 60; i += 1) {
    await new Promise((r) => setTimeout(r, 500));
    if (await serverUp()) return;
  }
  throw new Error("server failed to start");
}

// ---------- 批量浏览器 ----------
// 直接用 puppeteer.launch（pipe 通信，无固定端口），避免重启时端口占用/连到残留实例。
let browser = null;
let sinceRestart = 0;

async function closeBrowser() {
  if (!browser) return;
  try {
    await browser.close();
  } catch {
    /* ignore */
  }
  browser = null;
  await new Promise((r) => setTimeout(r, 400));
}

async function launchBrowser() {
  await closeBrowser();
  let lastError = null;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      browser = await puppeteer.launch({
        executablePath: EDGE,
        headless: true,
        args: ["--no-sandbox", "--disable-gpu", "--disable-dev-shm-usage", "--no-first-run"],
        defaultViewport: { width: VIEW_W, height: VIEW_H, deviceScaleFactor: 2 },
        protocolTimeout: 180000,
      });
      sinceRestart = 0;
      return browser;
    } catch (error) {
      lastError = error;
      await new Promise((r) => setTimeout(r, 1000));
    }
  }
  throw new Error(`batch browser failed to start: ${String(lastError?.message ?? lastError).slice(0, 120)}`);
}

async function ensureBrowser() {
  if (browser) {
    try {
      await browser.version();
      return browser;
    } catch {
      /* fall through */
    }
  }
  return launchBrowser();
}

// ---------- 对比核心 ----------
async function grayRaw(buf) {
  const { data, info } = await sharp(buf).grayscale().removeAlpha().raw().toBuffer({ resolveWithObject: true });
  return { data, w: info.width, h: info.height };
}
async function rgbRaw(buf) {
  const { data, info } = await sharp(buf).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  return { data, w: info.width, h: info.height, ch: info.channels };
}
async function maskAt(buf, factor) {
  const { data, info } = await sharp(buf)
    .resize({ width: Math.round(1588 / factor), height: Math.round(2246 / factor), fit: "fill" })
    .grayscale().removeAlpha().raw().toBuffer({ resolveWithObject: true });
  return { data, w: info.width, h: info.height };
}
function maskScore(A, B, dx, dy) {
  const x0 = Math.max(0, dx);
  const x1 = Math.min(A.w, A.w + dx);
  const y0 = Math.max(0, dy);
  const y1 = Math.min(A.h, A.h + dy);
  let inter = 0, ca = 0, cb = 0;
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
  const A2 = await maskAt(bufA, 2);
  const B2 = await maskAt(bufB, 2);
  let fine = { dx: best.dx * 4, dy: best.dy * 4, score: -1 };
  for (let dy = best.dy * 4 - 6; dy <= best.dy * 4 + 6; dy += 2) {
    for (let dx = best.dx * 4 - 6; dx <= best.dx * 4 + 6; dx += 2) {
      const s = maskScore(A2, B2, Math.round(dx / 2), Math.round(dy / 2));
      if (s > fine.score) fine = { dx, dy, score: s };
    }
  }
  return { dx: Math.max(-16, Math.min(16, fine.dx)), dy: Math.max(-90, Math.min(90, fine.dy)) };
}
function compareRgb(A, B, dx, dy) {
  const ch = 3;
  const W = A.w;
  const a = A.data, b = B.data;
  const x0 = Math.max(0, dx);
  const x1 = Math.min(W, W + dx);
  const y0 = Math.max(0, dy);
  const y1 = Math.min(A.h, A.h + dy);
  let sum = 0, changed = 0, n = 0;
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
function cropGray(img, W, H) {
  if (img.w === W && img.h === H) return img;
  const data = Buffer.allocUnsafe(W * H);
  for (let y = 0; y < H; y += 1) img.data.copy(data, y * W, y * img.w, y * img.w + W);
  return { data, w: W, h: H };
}
function cropRgb(img, W, H) {
  if (img.w === W && img.h === H) return img;
  const ch = 3;
  const data = Buffer.allocUnsafe(W * H * ch);
  for (let y = 0; y < H; y += 1) img.data.copy(data, y * W * ch, y * img.w * ch, y * img.w * ch + W * ch);
  return { data, w: W, h: H, ch };
}

// ---------- 文档构造 ----------
function buildDoc(token, entry, content) {
  return {
    schemaVersion: 1,
    id: `resume_batch_${token}`,
    title: content?.title ?? entry.name,
    templateId: `wcx-${token}`,
    templatePreset: {
      id: `wcx-${token}`,
      name: entry.name,
      desc: entry.desc ?? "",
      layout: entry.layout,
      tags: entry.tags ?? [],
      source: { token, name: entry.sourceName ?? entry.name },
      base: entry.tokens ?? {},
    },
    theme: { primary: "", fontScale: "md", lineHeight: 1.2, margin: 10 },
    basics: {
      name: "", jobTitle: "", phone: "", email: "", city: "", links: [],
      ...(content?.basics ?? {}),
    },
    sections: content?.sections ?? [],
    updatedAt: Date.now(),
  };
}

async function insertDoc(page, doc) {
  await page.evaluate(async (record) => {
    const openDB = (version) =>
      new Promise((resolve, reject) => {
        const req = version ? indexedDB.open("blazecv", version) : indexedDB.open("blazecv");
        req.onupgradeneeded = () => {
          const d = req.result;
          if (!d.objectStoreNames.contains("resumes")) d.createObjectStore("resumes", { keyPath: "id" });
          if (!d.objectStoreNames.contains("settings")) d.createObjectStore("settings", { keyPath: "key" });
          if (!d.objectStoreNames.contains("versions")) d.createObjectStore("versions", { keyPath: "id", autoIncrement: true });
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });
    let db = await openDB();
    if (!db.objectStoreNames.contains("resumes")) {
      db.close();
      db = await openDB(2);
    }
    await new Promise((resolve, reject) => {
      const tx = db.transaction(["resumes", "settings"], "readwrite");
      tx.objectStore("resumes").put(record);
      tx.objectStore("settings").put({ key: "active-resume", value: record.id });
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  }, { id: doc.id, title: doc.title, updatedAt: doc.updatedAt, doc });
}

// ---------- 单模板 ----------
async function runTemplate(token) {
  const entry = byToken.get(token);
  if (!entry) return { token, status: "no-catalog" };
  const content = JSON.parse(await readFile(path.join(ROOT, "public/template-content", `${token}.json`), "utf8").catch(() => "{}"));
  const doc = buildDoc(token, entry, content);
  const dl = path.join(OUT, ".dl", token);
  await rm(dl, { recursive: true, force: true });
  await mkdir(dl, { recursive: true });
  const started = Date.now();
  const page = await browser.newPage();
  let postBody = null;
  page.on("request", (req) => {
    if (req.url().includes("/api/export-image") && req.method() === "POST") postBody = req.postData();
  });
  const cdp = await page.createCDPSession();
  await cdp.send("Page.setDownloadBehavior", { behavior: "allow", downloadPath: dl });
  try {
    // 写库需要一个同源页面；/templates 会加载 3.7MB 目录，用 /editor 的浅导航代替。
    await page.goto(`${ORIGIN}/favicon.ico`, { waitUntil: "domcontentloaded", timeout: 30000 }).catch(() => undefined);
    await insertDoc(page, doc);
    await page.goto(`${ORIGIN}/editor?id=${encodeURIComponent(doc.id)}`, { waitUntil: "domcontentloaded", timeout: 45000 });
    try {
      await page.waitForSelector('iframe[title="原站模板 1:1 预览"]', { timeout: 12000 });
    } catch {
      // 偶发挂载失败（HEAD 检查/路由竞态）时重载一次再等。
      await page.reload({ waitUntil: "domcontentloaded", timeout: 45000 }).catch(() => undefined);
      await page.waitForSelector('iframe[title="原站模板 1:1 预览"]', { timeout: 30000 });
    }
    // exact 模式就绪（HEAD 检查通过）后再等绑定高度稳定；否则会在绑定中途截图，
    // 产生虚假的纵向偏移（历史 batch 中 dy=6~13 CSS px）。
    await page.waitForFunction(
      () => [...document.querySelectorAll("span")].some((s) => s.textContent?.includes("原站 DOM/CSS 1:1")),
      { timeout: 15000 },
    ).catch(() => undefined);
    let lastH = -1;
    let stable = 0;
    for (let k = 0; k < 80; k += 1) {
      await new Promise((r) => setTimeout(r, 250));
      const h = await page.evaluate(() =>
        Number(document.querySelector('iframe[title="原站模板 1:1 预览"]')?.getAttribute("height") ?? 0),
      );
      if (h > 0 && h === lastH) stable += 1;
      else stable = 0;
      lastH = h;
      if (stable >= 3) break;
    }
    await page.evaluate(async () => {
      const f = document.querySelector('iframe[title="原站模板 1:1 预览"]');
      await f?.contentDocument?.fonts?.ready?.catch?.(() => undefined);
    }).catch(() => undefined);
    await new Promise((r) => setTimeout(r, 350));

    const info = await page.evaluate(() => {
      const f = document.querySelector('iframe[title="原站模板 1:1 预览"]');
      return {
        src: f?.getAttribute("src") ?? "",
        height: Number(f?.getAttribute("height") ?? 0),
        pageCount: document.querySelectorAll("[data-resume-page]").length,
      };
    });
    const srcToken = info.src.split("/").pop()?.replace(/\.html$/, "") ?? "";
    if (srcToken !== token) {
      return { token, status: "wrong-template", srcToken, ms: Date.now() - started };
    }
    const cssH = info.height || 1123;
    const expectedPages = Math.max(1, Math.ceil((cssH - 20) / 1123));
    await page.waitForFunction(
      (n) => document.querySelectorAll("[data-resume-page]").length >= n,
      { timeout: 30000 },
      expectedPages,
    );
    if (process.env.BATCH_FLATTEN_TRANSFORM === "1") {
      // scale(1) 的 transform 仍会创建合成层，可能禁用亚像素抗锯齿，导致深色
      // 满版页文字边缘与无变换的导出不同。仅在预览已是 1:1 时去掉祖先 transform。
      await page.evaluate(() => {
        const el = document.querySelector("[data-resume-page]");
        if (!el) return;
        const w = el.getBoundingClientRect().width;
        if (Math.abs(w - 793.7) > 2) return;
        let p = el;
        while (p && p !== document.body) {
          const st = getComputedStyle(p);
          if (st.transform && st.transform !== "none") p.style.transform = "none";
          p = p.parentElement;
        }
      });
      await new Promise((r) => setTimeout(r, 300));
    }
    const els = await page.$$("[data-resume-page]");
    const editorPages = [];
    for (let p = 0; p < Math.min(els.length, expectedPages); p += 1) {
      editorPages.push(await els[p].screenshot({ type: "png" }));
    }
    if (editorPages.length === 0) return { token, status: "no-preview-pages", ms: Date.now() - started };

    // 触发真实导出（MenuItem 在 DOM 中即可点击，无需先展开菜单）。
    const clickExport = () =>
      page.evaluate(() => {
        const b = [...document.querySelectorAll("button")].find((x) => x.textContent?.includes("导出 PNG"));
        if (!b) return false;
        b.click();
        return true;
      });
    if (!(await clickExport())) return { token, status: "no-export-button", ms: Date.now() - started };

    const numberedPages = (files) =>
      files.filter((f) => /-p\d+-/.test(f))
        .sort((a, b) => Number(a.match(/-p(\d+)-/)[1]) - Number(b.match(/-p(\d+)-/)[1]));
    async function waitFiles(expected, timeoutMs) {
      const t0 = Date.now();
      let files = [];
      let stable = 0;
      while (Date.now() - t0 < timeoutMs) {
        await new Promise((r) => setTimeout(r, 400));
        files = await readdir(dl).catch(() => []);
        const numbered = numberedPages(files);
        const singles = files.filter((f) => f.endsWith(".png") && !/-p\d+-/.test(f));
        const found = Math.max(numbered.length, singles.length > 0 ? 1 : 0);
        if (found >= expected) {
          if (stable === 0) stable = Date.now();
          else if (Date.now() - stable > 1200) break;
        } else {
          stable = 0;
        }
      }
      return files;
    }
    let files = await waitFiles(expectedPages, 60000);
    let numbered = numberedPages(files);
    let singles = files.filter((f) => f.endsWith(".png") && !/-p\d+-/.test(f));
    let pageFiles = numbered.length > 0 ? numbered : singles;
    if (pageFiles.length === 0) {
      await new Promise((r) => setTimeout(r, 1500));
      await clickExport();
      files = await waitFiles(expectedPages, 45000);
      numbered = numberedPages(files);
      singles = files.filter((f) => f.endsWith(".png") && !/-p\d+-/.test(f));
      pageFiles = numbered.length > 0 ? numbered : singles;
    }
    if (pageFiles.length === 0) return { token, status: "export-failed", ms: Date.now() - started };

    const pageRows = [];
    let totalSum = 0;
    let totalPixels = 0;
    for (let p = 0; p < Math.min(editorPages.length, pageFiles.length); p += 1) {
      let exportBuf = await readFile(path.join(dl, pageFiles[p]));
      // 编辑页预览可能被整体缩放（窄面板），截图像素宽 <1588。此时把导出页
      // 等比缩到预览尺寸再比；否则旧逻辑只裁导出页左侧一小块，产生几十的假差异。
      const eMeta0 = await sharp(editorPages[p]).metadata();
      const xMeta0 = await sharp(exportBuf).metadata();
      let compareScale = 1;
      if (Math.abs(eMeta0.width - xMeta0.width) > 4) {
        compareScale = Math.round((eMeta0.width / xMeta0.width) * 10000) / 10000;
        exportBuf = await sharp(exportBuf).resize({ width: eMeta0.width }).png().toBuffer();
      }
      const A = await grayRaw(editorPages[p]);
      const B = await grayRaw(exportBuf);
      const W = Math.min(A.w, B.w);
      const H = Math.min(A.h, B.h);
      // 内容覆盖率：防止“两边都是空白页”被算成 0 差异的假通过。
      let ink = 0;
      for (let k = 0; k < A.data.length; k += 4) if (A.data[k] < 245) ink += 1;
      const inkPct = Math.round((ink / Math.max(1, A.data.length / 4)) * 1000) / 10;
      // 深色满版页的暗像素掩码几乎全是 1，对齐会滑到任意偏移（曾出现 dy=-45 假值）。
      // 覆盖率 >80% 时不做掩码对齐，直接按原位比较。
      const align = inkPct > 80 ? { dx: 0, dy: 0 } : await alignImages(editorPages[p], exportBuf);
      const { dx, dy } = align;
      const AC = cropRgb(await rgbRaw(editorPages[p]), W, H);
      const BC = cropRgb(await rgbRaw(exportBuf), W, H);
      const m = compareRgb(AC, BC, dx, dy);
      const zero = compareRgb(AC, BC, 0, 0);
      const em = await sharp(editorPages[p]).metadata();
      const xm = await sharp(exportBuf).metadata();
      pageRows.push({
        page: p + 1,
        editorSize: `${em.width}x${em.height}`,
        exportSize: `${xm.width}x${xm.height}`,
        compareScale,
        inkPct,
        offsetCss: { dx: dx / 2, dy: dy / 2 },
        mean: m.mean,
        changedPct: m.changedPct,
        meanNoAlign: zero.mean,
      });
      if (process.env.BATCH_SAVE_RAW === "1") {
        const rawDir = path.join(OUT, "raw");
        await mkdir(rawDir, { recursive: true });
        await writeFile(path.join(rawDir, `${token}-editor-p${p + 1}.png`), editorPages[p]);
        await writeFile(path.join(rawDir, `${token}-export-p${p + 1}.png`), exportBuf);
      }
      totalSum += m.mean * W * H;
      totalPixels += W * H;

      // 空白末页的 dy 对齐没有意义（meanNoAlign 接近 0 时不要仅凭 dy 报警）。
      const flag = m.mean > 6 || m.changedPct > 8 || (Math.abs(dy) > 80 && zero.mean > 1) || inkPct < 0.2;
      if (flag) {
        const left = await sharp(editorPages[p]).extract({ left: Math.max(0, dx), top: Math.max(0, dy), width: W - Math.abs(dx), height: H - Math.abs(dy) }).png().toBuffer();
        const right = await sharp(exportBuf).extract({ left: Math.max(0, -dx), top: Math.max(0, -dy), width: W - Math.abs(dx), height: H - Math.abs(dy) }).png().toBuffer();
        const meta = await sharp(left).metadata();
        await sharp({ create: { width: meta.width * 2 + 20, height: meta.height + 40, channels: 3, background: "#d0d4da" } })
          .composite([
            { input: left, left: 0, top: 40 },
            { input: right, left: meta.width + 20, top: 40 },
            { input: Buffer.from(`<svg width="${meta.width * 2 + 20}" height="40"><text x="10" y="26" font-family="sans-serif" font-size="18" fill="#111">${entry.name} p${p + 1} · mean=${m.mean} changed=${m.changedPct}% offset=(${dx / 2},${dy / 2})css</text></svg>`), left: 0, top: 0 },
          ])
          .png()
          .toFile(path.join(IMAGES, `${token}-p${p + 1}.png`));
      }
    }
    const overall = Math.round((totalSum / Math.max(1, totalPixels)) * 100) / 100;
    let posted = null;
    try {
      posted = postBody ? JSON.parse(postBody) : null;
    } catch {
      posted = null;
    }
    if (process.env.BATCH_SAVE_RAW === "1" && posted?.doc) {
      const rawDir = path.join(OUT, "raw");
      await mkdir(rawDir, { recursive: true });
      await writeFile(path.join(rawDir, `${token}-posted.json`), JSON.stringify(posted.doc, null, 2), "utf8");
    }
    return {
      token,
      id: entry.id,
      name: entry.name,
      layout: entry.layout,
      postedTheme: posted?.doc?.theme ?? null,
      postedTemplateId: posted?.doc?.templateId ?? null,
      postedSectionCount: posted?.doc?.sections?.length ?? null,
      status: "ok",
      cssH,
      expectedPages,
      exportPages: pageFiles.length,
      pageCountMismatch: pageFiles.length !== expectedPages,
      mean: overall,
      pages: pageRows,
      flagged:
        pageFiles.length !== expectedPages ||
        pageRows.some(
          (r) =>
            r.mean > 6 ||
            r.changedPct > 8 ||
            (Math.abs(r.offsetCss.dy) > 40 && r.meanNoAlign > 1) ||
            r.inkPct < 0.2,
        ),
      ms: Date.now() - started,
    };
  } finally {
    await page.close().catch(() => undefined);
    await rm(dl, { recursive: true, force: true }).catch(() => undefined);
  }
}

// ---------- 主循环 ----------
if (process.env.BATCH_RESTART_SERVER !== "0") {
  await ensureServer(true);
} else {
  await ensureServer(false);
}
await ensureBrowser();

const counts = new Map();
let i = 0;
for (const token of todo) {
  i += 1;
  if (sinceRestart >= RESTART_EVERY) {
    console.log(`restart browser after ${sinceRestart} templates`);
    await launchBrowser();
  }
  await ensureServer(false);
  let row;
  try {
    row = await runTemplate(token);
  } catch (error) {
    const msg = String(error?.message ?? error);
    console.log(`[${i}/${todo.length}] ${token} ERR ${msg.slice(0, 140)}`);
    try {
      await launchBrowser();
      row = await runTemplate(token);
    } catch (error2) {
      row = { token, status: "error", error: String(error2?.message ?? error2).slice(0, 200) };
    }
  }
  sinceRestart += 1;
  counts.set(row.status, (counts.get(row.status) ?? 0) + 1);
  await appendFile(RESULTS, JSON.stringify({ ...row, at: new Date().toISOString() }) + "\n", "utf8");
  const brief = row.status === "ok"
    ? `mean=${row.mean} pages=${row.exportPages}/${row.expectedPages}${row.flagged ? " FLAG" : ""}`
    : row.status + (row.error ? ` ${row.error.slice(0, 80)}` : "");
  console.log(`[${i}/${todo.length}] ${token} ${row.name ?? ""} ${brief}`);

  if (i % 10 === 0) {
    console.log(`progress ${i}/${todo.length} · ${[...counts.entries()].map(([k, v]) => `${k}=${v}`).join(" ")}`);
  }
}

// 汇总
const rows = [];
try {
  const text = await readFile(RESULTS, "utf8");
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim()) continue;
    try { rows.push(JSON.parse(line)); } catch { /* ignore */ }
  }
} catch { /* ignore */ }
const okRows = rows.filter((r) => r.status === "ok");
const sorted = [...okRows].sort((a, b) => b.mean - a.mean);
const summary = {
  generatedAt: new Date().toISOString(),
  tested: rows.length,
  ok: okRows.length,
  failed: rows.length - okRows.length,
  statuses: Object.fromEntries(counts),
  flagged: okRows.filter((r) => r.flagged).length,
  mean: okRows.length ? Math.round((okRows.reduce((s, r) => s + r.mean, 0) / okRows.length) * 100) / 100 : null,
  maxMean: sorted[0]?.mean ?? null,
  worst: sorted.slice(0, 20).map((r) => ({ token: r.token, name: r.name, mean: r.mean, pages: r.pages })),
};
await writeFile(SUMMARY, JSON.stringify(summary, null, 2), "utf8");
console.log("DONE", JSON.stringify(summary, null, 2));
await closeBrowser();

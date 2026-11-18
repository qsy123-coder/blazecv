import puppeteer from "puppeteer-core";
import AdmZip from "adm-zip";
import { PDFDocument } from "pdf-lib";
import { mkdtemp, readdir, readFile, stat, unlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

const CDP_URL = process.env.CDP_URL ?? "http://127.0.0.1:9222";
const APP_URL = process.env.APP_URL ?? "http://127.0.0.1:3000";

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const results = [];

function check(name, ok, detail = "") {
  results.push({ name, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${detail ? ` — ${detail}` : ""}`);
  if (!ok) process.exitCode = 1;
}

async function waitForFile(dir, ext, timeout = 20000) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    const files = await readdir(dir).catch(() => []);
    const hit = files.find(
      (file) => file.toLowerCase().endsWith(ext) && !file.endsWith(".crdownload"),
    );
    if (hit) {
      const full = path.join(dir, hit);
      let last = -1;
      for (let i = 0; i < 30; i += 1) {
        const size = (await stat(full)).size;
        if (size > 0 && size === last) return full;
        last = size;
        await sleep(120);
      }
      return full;
    }
    await sleep(200);
  }
  throw new Error(`等待下载 ${ext} 超时`);
}

async function clickByText(page, text) {
  const clicked = await page.evaluate((label) => {
    const elements = [...document.querySelectorAll("button, summary")];
    const target =
      elements.find((element) => (element.textContent ?? "").trim() === label) ??
      elements.find((element) => (element.textContent ?? "").includes(label));
    if (!target) return false;
    target.click();
    return true;
  }, text);
  if (!clicked) throw new Error(`找不到可点击元素：${text}`);
  await sleep(200);
}

async function titleValue(page) {
  return page.$eval('input[aria-label="简历名称"]', (element) => element.value);
}

const downloadDir = await mkdtemp(path.join(tmpdir(), "blazecv-dl-"));
const shotDir = await mkdtemp(path.join(tmpdir(), "blazecv-verify-"));
console.log(`downloads: ${downloadDir}`);
console.log(`screenshots: ${shotDir}`);

const browser = await puppeteer.connect({
  browserURL: CDP_URL,
  defaultViewport: { width: 1600, height: 1000 },
  protocolTimeout: 180000,
});
const page = await browser.newPage();
const otherPages = await browser.pages();
for (const other of otherPages) {
  if (other !== page) await other.close().catch(() => undefined);
}
await page.goto("about:blank");
const runtimeErrors = [];

page.on("pageerror", (error) => runtimeErrors.push(`pageerror: ${error}`));
page.on("console", (message) => {
  if (message.type() === "error") runtimeErrors.push(message.text());
});
page.on("dialog", (dialog) => {
  void dialog.accept();
});

const cdp = await page.createCDPSession();
await cdp.send("Page.setDownloadBehavior", { behavior: "allow", downloadPath: downloadDir });
await cdp.send("Storage.clearDataForOrigin", {
  origin: new URL(APP_URL).origin,
  storageTypes: "indexeddb,cookies,local_storage",
});

await page.goto(APP_URL, { waitUntil: "networkidle2", timeout: 30000 });
await page.waitForFunction(() => document.body.innerText.includes("浏览模板"), {
  timeout: 20000,
});

// The home market now renders the full library; it lazy-loads when reached.
await page.evaluate(() => {
  document.querySelector("#templates")?.scrollIntoView({ block: "start" });
});
await page.waitForFunction(
  () => document.querySelectorAll("[data-catalog-card]").length >= 24,
  { timeout: 30000 },
);
const galleryCount = await page.$$eval(
  "[data-catalog-card]",
  (buttons) => buttons.length,
);
check("首页模板市场渲染", galleryCount >= 24, `${galleryCount} 个模板入口`);
const homeHasCloudEntry = await page.evaluate(() =>
  document.body.innerText.includes("登录"),
);
check("首页云端入口", homeHasCloudEntry);

const catalogTotal = () =>
  page.evaluate(() => document.body.innerText.match(/共 (\d+) 套/)?.[1] ?? "");
const totalBefore = await catalogTotal();
await clickByText(page, "应届生");
await page.waitForFunction(
  (before) => {
    const match = document.body.innerText.match(/共 (\d+) 套/)?.[1];
    return Boolean(match) && match !== before;
  },
  { timeout: 15000 },
  totalBefore,
);
const taggedTotal = await catalogTotal();
check(
  "模板用途筛选",
  Number(taggedTotal) > 0 && taggedTotal !== totalBefore,
  `共 ${taggedTotal} 套`,
);
await clickByText(page, "全部用途");
await page.waitForFunction(
  (before) => document.body.innerText.match(/共 (\d+) 套/)?.[1] === before,
  { timeout: 15000 },
  totalBefore,
);
const initiallyEmpty = await page.evaluate(
  () => document.querySelectorAll('a[href^="/editor?id="]').length === 0,
);
check("首页初始无简历列表", initiallyEmpty);
await page.screenshot({ path: path.join(shotDir, "00-home.png") });

await page.click("[data-catalog-card]");
await page.waitForFunction(() => window.location.pathname === "/editor", {
  timeout: 20000,
});
await page.waitForFunction(
  () => Boolean(document.querySelector('input[aria-label="简历名称"]')),
  { timeout: 20000 },
);
const createdTitle = await titleValue(page);
check(
  "首页点击模板创建新简历",
  page.url().includes("id=") && createdTitle === "未命名简历",
  `${page.url()} / ${createdTitle}`,
);
await page.waitForFunction(
  () => document.querySelectorAll("[data-resume-page]").length >= 1,
  { timeout: 10000 },
);

// 左栏（简历内容）必须在一屏内展示完，不允许纵向滚动条。
const panelFit = await page.evaluate(() => {
  const panel =
    document.querySelector("[data-editor-scroll]") ?? document.querySelector("aside");
  if (!panel) return null;
  return { clientH: panel.clientHeight, scrollH: panel.scrollHeight };
});
check(
  "左栏一屏内无滚动",
  panelFit !== null && panelFit.scrollH <= panelFit.clientH + 1,
  panelFit ? `${panelFit.scrollH}/${panelFit.clientH}` : "no aside",
);

await page.click('a[aria-label="返回首页"]');
// Wait until the home route is committed: the editor's own top bar also has a
// /resumes link, so selecting it mid-transition hits a detached node.
await page.waitForFunction(
  () =>
    window.location.pathname === "/" &&
    Boolean(document.querySelector('header a[href="/resumes"]')),
  { timeout: 10000 },
);
await page.click('header a[href="/resumes"]');
await page.waitForFunction(() => window.location.pathname === "/resumes", {
  timeout: 10000,
});
await page.waitForFunction(
  () => document.querySelectorAll("[data-resume-card]").length >= 1,
  { timeout: 10000 },
);
const library = await page.evaluate(() => ({
  count: document.querySelectorAll("[data-resume-card]").length,
  hasResume: document.body.innerText.includes("未命名简历"),
  hasCurrent: document.body.innerText.includes("当前"),
}));
check(
  "我的简历独立页面",
  library.count === 1 && library.hasResume && library.hasCurrent,
  `${library.count} 份`,
);
await page.screenshot({ path: path.join(shotDir, "00b-resumes.png") });

await page.evaluate(() => {
  const card = document.querySelector("[data-resume-card]");
  const button = [...card.querySelectorAll("button")].find(
    (item) => item.textContent?.trim() === "复制",
  );
  button?.click();
});
await page.waitForFunction(
  () => document.querySelectorAll("[data-resume-card]").length === 2,
  { timeout: 10000 },
);
check("复制简历", true);

await page.evaluate(() => {
  const card = document.querySelector("[data-resume-card]");
  const button = [...card.querySelectorAll("button")].find(
    (item) => item.textContent?.trim() === "删除",
  );
  button?.click();
});
await page.waitForFunction(
  () => document.querySelectorAll("[data-resume-card]").length === 1,
  { timeout: 10000 },
);
check("删除简历", true);

// 先离开页面再清库：页面上的 Dexie 连接会持有 open 的 IndexedDB，
// 直接清除会让删除请求一直 blocked，随后新页面加载编辑器会卡在“正在载入简历…”。
await page.goto("about:blank");
await sleep(300);
await cdp.send("Storage.clearDataForOrigin", {
  origin: new URL(APP_URL).origin,
  storageTypes: "indexeddb,cookies",
});
await page.goto(`${APP_URL}/editor?template=business`, {
  waitUntil: "networkidle2",
  timeout: 30000,
});
await page.waitForFunction(
  () => Boolean(document.querySelector('input[aria-label="简历名称"]')),
  { timeout: 20000 },
);

const diagnostics = await page.evaluate(() => {
  const text = document.body.innerText;
  const match = text.match(/通过 (\d+) \/ (\d+) 项/);
  return {
    hasCard: text.includes("内容检查"),
    passed: match ? Number(match[1]) : 0,
    total: match ? Number(match[2]) : 0,
  };
});
check(
  "内容检查评分渲染",
  diagnostics.hasCard && diagnostics.total > 0,
  `${diagnostics.passed}/${diagnostics.total}`,
);

const loadedTitle = await titleValue(page);
check("简历标题加载", loadedTitle === "前端开发-张三", loadedTitle);

await page.click('input[aria-label="简历名称"]');
await page.keyboard.press("End");
await page.keyboard.type("-undo");
await sleep(150);
const typedTitle = await titleValue(page);
await page.keyboard.down("Control");
await page.keyboard.press("z");
await page.keyboard.up("Control");
await sleep(150);
const undoneTitle = await titleValue(page);
await page.keyboard.down("Control");
await page.keyboard.down("Shift");
await page.keyboard.press("z");
await page.keyboard.up("Shift");
await page.keyboard.up("Control");
await sleep(150);
const redoneTitle = await titleValue(page);
await page.keyboard.down("Control");
await page.keyboard.press("z");
await page.keyboard.up("Control");
await sleep(150);
const finalTitle = await titleValue(page);
check(
  "撤销与重做",
  typedTitle.endsWith("-undo") &&
    undoneTitle === loadedTitle &&
    redoneTitle === typedTitle &&
    finalTitle === loadedTitle,
  `${undoneTitle} / ${redoneTitle} / ${finalTitle}`,
);

await page.screenshot({ path: path.join(shotDir, "01-default.png") });

await clickByText(page, "模板");
await page.waitForFunction(() => document.body.innerText.includes("选择模板"));
check("模板面板打开", true);

const galleryText = await page.evaluate(() => document.body.innerText);
check(
  "模板画廊分组筛选",
  galleryText.includes("浅色侧栏") &&
    galleryText.includes("通栏横幅") &&
    galleryText.includes("编辑标签栏"),
);

const generatedSelected = await page.evaluate(() => {
  const button = document.querySelector(
    'button[data-template-id="wc-7035794f6173aa72"]',
  );
  button?.click();
  return Boolean(button);
});
await page.waitForFunction(
  () => document.body.innerText.includes("校招 · 红 · 时间轴"),
  { timeout: 10000 },
);
check("生成模板可应用", generatedSelected);

await clickByText(page, "模板");
await page.waitForFunction(() => document.body.innerText.includes("选择模板"));
await clickByText(page, "商务蓝");
await page.waitForFunction(() => document.body.innerText.includes("商务蓝"), { timeout: 10000 });
check("切换到商务蓝模板", true);
await page.screenshot({ path: path.join(shotDir, "02-business.png") });

await sleep(900);
await page.reload({ waitUntil: "networkidle2", timeout: 30000 });
await page.waitForFunction(() => document.body.innerText.includes("张三"), { timeout: 20000 });
const restoredTitle = await titleValue(page);
const restoredText = await page.evaluate(() => document.body.innerText);
check(
  "刷新后自动保存恢复",
  restoredTitle === "前端开发-张三" && restoredText.includes("商务蓝"),
  `title=${restoredTitle}, template=${restoredText.includes("商务蓝") ? "商务蓝" : "丢失"}`,
);

await clickByText(page, "导出");
await clickByText(page, "导出 PNG 图片");
const pngPath = await waitForFile(downloadDir, ".png");
const pngStat = await stat(pngPath);
check("导出 PNG 图片", pngStat.size > 10000, `${path.basename(pngPath)} ${pngStat.size}B`);

const pngBuffer = await readFile(pngPath);
const pngWidth = pngBuffer.readUInt32BE(16);
const pngHeight = pngBuffer.readUInt32BE(20);
check(
  "PNG 2x 尺寸",
  Math.abs(pngWidth - 1588) <= 3 && Math.abs(pngHeight - 2246) <= 3,
  `${pngWidth}x${pngHeight}`,
);

await clickByText(page, "导出");
await clickByText(page, "导出 Word 文档");
const docxPath = await waitForFile(downloadDir, ".docx");
const zip = new AdmZip(docxPath);
const documentXml = zip.readAsText("word/document.xml");
check(
  "导出 Word 内容完整",
  documentXml.includes("张三") && documentXml.includes("字节跳动"),
  `${path.basename(docxPath)} ${documentXml.length} chars`,
);

const pdfPath = path.join(shotDir, "resume.pdf");
await page.pdf({ path: pdfPath, printBackground: true, preferCSSPageSize: true });
const pdfBytes = await readFile(pdfPath);
const pdf = await PDFDocument.load(pdfBytes);
check("打印 PDF 为 A4 单页", pdf.getPageCount() === 1, `pages=${pdf.getPageCount()}, ${pdfBytes.length}B`);

await clickByText(page, "备份");
await clickByText(page, "导出 JSON");
const jsonPath = await waitForFile(downloadDir, ".json");
const backup = JSON.parse(await readFile(jsonPath, "utf8"));
check(
  "导出 JSON 备份",
  backup.schemaVersion === 1 && backup.templateId === "business",
  `template=${backup.templateId}`,
);

const oldPngs = (await readdir(downloadDir)).filter((file) => file.endsWith(".png"));
for (const file of oldPngs) await unlink(path.join(downloadDir, file));

await page.setOfflineMode(true);
await page.click('input[aria-label="简历名称"]');
await page.keyboard.press("End");
await page.keyboard.type("-offline");
const offlineTitle = await titleValue(page);
await clickByText(page, "导出");
await clickByText(page, "导出 PNG 图片");
const offlinePng = await waitForFile(downloadDir, ".png");
check(
  "离线编辑与导出",
  offlineTitle.endsWith("-offline") && (await stat(offlinePng)).size > 10000,
  `${offlineTitle} / ${path.basename(offlinePng)}`,
);
await page.setOfflineMode(false);

await clickByText(page, "备份");
await clickByText(page, "清空内容");
await sleep(500);
const clearedTitle = await titleValue(page);
check("清空内容", clearedTitle === "未命名简历", clearedTitle);

const fileInput = await page.$('input[type="file"][accept*="json"]');
await fileInput.uploadFile(jsonPath);
await sleep(800);
const importedTitle = await titleValue(page);
check("导入 JSON 还原", importedTitle === "前端开发-张三", importedTitle);
await sleep(700);

await clickByText(page, "模板");
await page.waitForFunction(() => document.body.innerText.includes("选择模板"));
await page.screenshot({ path: path.join(shotDir, "03-templates.png") });
await page.keyboard.press("Escape");

await page.click('a[aria-label="返回首页"]');
await page.waitForFunction(
  () => document.body.innerText.includes("上次编辑：前端开发-张三"),
  { timeout: 10000 },
);
const homeText = await page.evaluate(() => document.body.innerText);
check(
  "返回首页显示继续编辑",
  homeText.includes("上次编辑：前端开发-张三"),
);
await page.screenshot({ path: path.join(shotDir, "04-home-saved.png") });

await page.goto(`${APP_URL}/editor`, { waitUntil: "networkidle2", timeout: 30000 });
await page.waitForFunction(() => document.body.innerText.includes("张三"), {
  timeout: 20000,
});
const secondTab = await browser.newPage();
await secondTab.goto(`${APP_URL}/editor`, { waitUntil: "networkidle2", timeout: 30000 });
await secondTab.waitForFunction(() => document.body.innerText.includes("张三"), {
  timeout: 20000,
});
await secondTab.click('input[aria-label="简历名称"]');
await secondTab.keyboard.press("End");
await secondTab.keyboard.type("-第二个标签");
await sleep(900);
await page.waitForFunction(
  () => document.body.innerText.includes("另一标签页已保存更新"),
  { timeout: 8000 },
);
check("多标签冲突提示", true);
await secondTab.close();

await page.evaluate(() => {
  const ranges = [...document.querySelectorAll('input[type="range"]')];
  const setter = Object.getOwnPropertyDescriptor(
    HTMLInputElement.prototype,
    "value",
  )?.set;
  if (!setter) return;
  if (ranges[0]) {
    setter.call(ranges[0], "1.8");
    ranges[0].dispatchEvent(new Event("input", { bubbles: true }));
  }
  if (ranges[1]) {
    setter.call(ranges[1], "22");
    ranges[1].dispatchEvent(new Event("input", { bubbles: true }));
  }
});
await clickByText(page, "大");
// 模块默认折叠（左栏一屏内不滚动）；先展开第一个模块再写内容。
await page.evaluate(() => {
  const card = document.querySelector("aside .scroll-mt-12");
  card?.querySelector("button")?.click();
});
await sleep(400);
await page.evaluate(() => {
  const area = document.querySelector("aside textarea");
  if (!area) return;
  const setter = Object.getOwnPropertyDescriptor(
    HTMLTextAreaElement.prototype,
    "value",
  )?.set;
  setter?.call(
    area,
    "负责核心业务系统的架构设计与性能优化，推动关键指标持续提升。".repeat(40),
  );
  area.dispatchEvent(new Event("input", { bubbles: true }));
});
await sleep(1800);
await page.waitForFunction(
  () => document.querySelectorAll("[data-resume-page]").length >= 2,
  { timeout: 15000 },
);
const multiPage = await page.evaluate(() => {
  const frames = [...document.querySelectorAll("[data-resume-page]")];
  return {
    count: frames.length,
    maxHeight: Math.max(
      ...frames.map((frame) => frame.firstElementChild?.scrollHeight ?? 0),
    ),
    label: document.body.innerText.match(/共 \d+ 页/)?.[0] ?? null,
  };
});
check(
  "多页排版",
  multiPage.count >= 2 && multiPage.maxHeight <= 1126,
  `${multiPage.count} 页, max=${multiPage.maxHeight}, ${multiPage.label}`,
);

const multiPdfPath = path.join(shotDir, "resume-multi.pdf");
await page.pdf({
  path: multiPdfPath,
  printBackground: true,
  preferCSSPageSize: true,
});
const multiPdf = await PDFDocument.load(await readFile(multiPdfPath));
check("多页 PDF", multiPdf.getPageCount() >= 2, `pages=${multiPdf.getPageCount()}`);

const prePngs = (await readdir(downloadDir)).filter((file) => file.endsWith(".png"));
for (const file of prePngs) await unlink(path.join(downloadDir, file));
await clickByText(page, "导出");
await clickByText(page, "导出 PNG 图片");
await sleep(3000);
const multiPngs = (await readdir(downloadDir)).filter(
  (file) => file.endsWith(".png") && !file.endsWith(".crdownload"),
);
check("多页 PNG 导出", multiPngs.length >= 2, `${multiPngs.length} 张`);

await clickByText(page, "备份");
await clickByText(page, "历史版本");
await page.waitForFunction(() => document.body.innerText.includes("保存当前版本"));
await clickByText(page, "保存当前版本");
await page.waitForFunction(() => document.body.innerText.includes("已保存当前版本"), {
  timeout: 10000,
});
check("版本历史保存", true);
await page.keyboard.press("Escape");

await page.click('input[aria-label="简历名称"]');
await page.keyboard.press("End");
await page.keyboard.type("-version");
await sleep(200);
const changedTitle = await titleValue(page);
await clickByText(page, "备份");
await clickByText(page, "历史版本");
await page.waitForFunction(() => document.body.innerText.includes("恢复"), {
  timeout: 10000,
});
const clickedRestore = await page.evaluate(() => {
  const button = [...document.querySelectorAll("button")].find(
    (item) => item.textContent?.trim() === "恢复",
  );
  if (!button) return false;
  button.click();
  return true;
});
await sleep(800);
const versionRestoredTitle = await titleValue(page);
check(
  "版本历史恢复",
  clickedRestore &&
    changedTitle === `${loadedTitle}-version` &&
    versionRestoredTitle === loadedTitle,
  `${changedTitle} → ${versionRestoredTitle}`,
);
await page.keyboard.press("Escape");

await clickByText(page, "登录");
await page.waitForFunction(() => document.body.innerText.includes("登录 / 注册"), {
  timeout: 8000,
});
check("云端登录面板", true);
await page.screenshot({ path: path.join(shotDir, "05-cloud.png") });
await page.keyboard.press("Escape");

const cloudEmail = `verify-${Date.now()}@qq.com`;
const cloudResult = await page.evaluate(async (email) => {
  const post = (url, body) =>
    fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  const register = await post("/api/auth/register", {
    email,
    password: "test-password-123",
  });
  const me = await fetch("/api/auth/me").then((response) => response.json());
  const doc = {
    schemaVersion: 1,
    id: "cloud-test",
    title: "云端测试",
    templateId: "minimal",
    theme: { primary: "", fontScale: "md", lineHeight: 1.5, margin: 16 },
    basics: {
      name: "云端测试",
      jobTitle: "",
      phone: "",
      email: "",
      city: "",
      links: [],
    },
    sections: [
      {
        id: "cloud-s1",
        type: "summary",
        title: "个人简介",
        visible: true,
        content: "云端同步验证内容",
      },
    ],
    updatedAt: Date.now(),
  };
  const put = await fetch("/api/resume", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ doc }),
  });
  const pull = await fetch("/api/resume").then((response) => response.json());
  const duplicate = await post("/api/auth/register", {
    email,
    password: "test-password-123",
  });
  const logout = await post("/api/auth/logout", {});
  const meAfter = await fetch("/api/auth/me").then((response) => response.json());
  return {
    register: register.status,
    me: me.user?.email ?? null,
    put: put.status,
    pullTitle: pull.resume?.doc?.title ?? null,
    duplicate: duplicate.status,
    logout: logout.status,
    meAfter: meAfter.user,
  };
}, cloudEmail);

check(
  "云端注册与会话",
  cloudResult.register === 200 &&
    cloudResult.me === cloudEmail &&
    cloudResult.meAfter === null,
  `${cloudResult.register} / ${cloudResult.me ?? "null"}`,
);
check(
  "云端保存与载入",
  cloudResult.put === 200 && cloudResult.pullTitle === "云端测试",
  `put=${cloudResult.put}, title=${cloudResult.pullTitle}`,
);
check("重复注册被拒绝", cloudResult.duplicate === 409, String(cloudResult.duplicate));

const isolation = await page.evaluate(async () => {
  const password = "test-password-123";
  const baseDoc = (id, title) => ({
    schemaVersion: 1,
    id,
    title,
    templateId: "minimal",
    theme: { primary: "", fontScale: "md", lineHeight: 1.5, margin: 16 },
    basics: {
      name: title,
      jobTitle: "",
      phone: "",
      email: "",
      city: "",
      links: [],
    },
    sections: [
      {
        id: "iso-summary",
        type: "summary",
        title: "个人简介",
        visible: true,
        content: "隔离测试",
      },
    ],
    updatedAt: Date.now(),
  });
  const post = (url, body) =>
    fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  const register = (email) => post("/api/auth/register", { email, password });
  const login = (email) => post("/api/auth/login", { email, password });
  const logout = () => post("/api/auth/logout", {});
  const put = (id, title) =>
    fetch(`/api/resumes/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ doc: baseDoc(id, title) }),
    });
  const get = (id) =>
    fetch(`/api/resumes/${id}`).then((response) => response.json());
  const list = () =>
    fetch("/api/resumes").then((response) => response.json());

  const email1 = `iso1-${Date.now()}@qq.com`;
  const email2 = `iso2-${Date.now()}@qq.com`;

  await register(email1);
  const put1 = await put("shared-resume", "用户一");
  const list1 = await list();
  await logout();

  await register(email2);
  const put2 = await put("shared-resume", "用户二");
  const get2 = await get("shared-resume");
  await logout();

  const login1 = await login(email1);
  const get1 = await get("shared-resume");
  const list1After = await list();
  await logout();

  return {
    put1: put1.status,
    put2: put2.status,
    list1: list1.resumes?.length ?? 0,
    get1Title: get1.resume?.title ?? null,
    get2Title: get2.resume?.title ?? null,
    login1: login1.status,
    list1After: list1After.resumes?.length ?? 0,
  };
});
check(
  "云端多份简历隔离",
  isolation.put1 === 200 &&
    isolation.put2 === 200 &&
    isolation.list1 === 1 &&
    isolation.login1 === 200 &&
    isolation.get1Title === "用户一" &&
    isolation.get2Title === "用户二" &&
    isolation.list1After === 1,
  `${isolation.get1Title} / ${isolation.get2Title} / list=${isolation.list1After}`,
);

const uiEmail = `ui-${Date.now()}@qq.com`;
await clickByText(page, "登录");
await page.waitForFunction(() => document.body.innerText.includes("登录 / 注册"));
await clickByText(page, "邮箱登录");
await clickByText(page, "立即注册");
await page.type('input[type="email"]', uiEmail);
await page.type('input[type="password"]', "test-password-123");
await clickByText(page, "创建账号");
await page.waitForFunction(() => document.body.innerText.includes("已登录："), {
  timeout: 15000,
});
await clickByText(page, "保存到云端");
await page.waitForFunction(() => document.body.innerText.includes("已保存到云端"), {
  timeout: 15000,
});
check("云端 UI 保存", true);

await clickByText(page, "创建分享链接");
await page.waitForFunction(
  () => document.body.innerText.includes("分享链接已创建"),
  { timeout: 15000 },
);
const shareUrl = await page.$eval(
  'input[aria-label="分享链接"]',
  (input) => input.value,
);
check("分享链接创建", /\/r\/[A-Za-z0-9_-]{16,}$/.test(shareUrl), shareUrl);

const shareContext = await browser.createBrowserContext();
const shareTab = await shareContext.newPage();
await shareTab.setViewport({ width: 1200, height: 1000 });
await shareTab.goto(shareUrl, { waitUntil: "networkidle2", timeout: 30000 });
await shareTab.waitForFunction(() => document.body.innerText.includes("张三"), {
  timeout: 20000,
});
const shareText = await shareTab.evaluate(() => document.body.innerText);
check("分享页可公开访问", shareText.includes("只读分享"));
await shareTab.screenshot({ path: path.join(shotDir, "06-share.png") });
await shareContext.close();

const shareSecurity = await page.evaluate(async (url) => {
  const token = url.split("/r/")[1];
  const resume = await fetch("/api/resume").then((response) => response.json());
  const doc = resume.resume.doc;
  const set = await fetch("/api/share", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ doc, password: "share-pass-123", expiresInDays: 7 }),
  });
  const info = await fetch("/api/share").then((response) => response.json());
  const lockedHtml = await fetch(url, {
    credentials: "omit",
    cache: "no-store",
  }).then((response) => response.text());
  const wrong = await fetch(`/api/public/share/${token}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ password: "wrong-pass" }),
  });
  const right = await fetch(`/api/public/share/${token}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ password: "share-pass-123" }),
  });
  const rightBody = await right.json();
  const clear = await fetch("/api/share", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ doc, password: null, expiresInDays: null }),
  });
  const cleared = await fetch("/api/share").then((response) => response.json());
  const openHtml = await fetch(url, {
    credentials: "omit",
    cache: "no-store",
  }).then((response) => response.text());
  return {
    setStatus: set.status,
    info: info.share,
    locked: lockedHtml.includes("此分享受密码保护"),
    leaked: lockedHtml.includes("张三"),
    wrongStatus: wrong.status,
    rightStatus: right.status,
    unlockedName: rightBody.doc?.basics?.name ?? null,
    clearStatus: clear.status,
    cleared: cleared.share,
    open: openHtml.includes("张三"),
  };
}, shareUrl);
check(
  "分享密码与有效期",
  shareSecurity.setStatus === 200 &&
    shareSecurity.info?.hasPassword === true &&
    Boolean(shareSecurity.info?.expiresAt) &&
    shareSecurity.locked &&
    !shareSecurity.leaked,
  `set=${shareSecurity.setStatus}, locked=${shareSecurity.locked}, leaked=${shareSecurity.leaked}`,
);
check(
  "分享密码校验",
  shareSecurity.wrongStatus === 401 &&
    shareSecurity.rightStatus === 200 &&
    shareSecurity.unlockedName === "张三",
  `wrong=${shareSecurity.wrongStatus}, right=${shareSecurity.rightStatus}`,
);
check(
  "取消分享密码",
  shareSecurity.clearStatus === 200 &&
    shareSecurity.cleared?.hasPassword === false &&
    shareSecurity.cleared?.expiresAt === null &&
    shareSecurity.open,
  `clear=${shareSecurity.clearStatus}, open=${shareSecurity.open}`,
);

await clickByText(page, "撤销分享");
await page.waitForFunction(
  () => document.body.innerText.includes("分享已撤销"),
  { timeout: 15000 },
);
const revokedStatus = await page.evaluate(
  async (url) =>
    (await fetch(url, { credentials: "omit", cache: "no-store" })).status,
  shareUrl,
);
check("撤销分享后失效", revokedStatus === 404, `status=${revokedStatus}`);

await page.keyboard.press("Escape");

await page.reload({ waitUntil: "networkidle2", timeout: 30000 });
await page.waitForFunction(() => document.body.innerText.includes("张三"), {
  timeout: 20000,
});
await page.waitForFunction(
  () =>
    [...document.querySelectorAll("button")].some(
      (button) => button.textContent?.trim() === "云端",
    ),
  { timeout: 12000 },
);
await clickByText(page, "云端");
await page.waitForFunction(() => document.body.innerText.includes("从云端载入"));
await clickByText(page, "从云端载入");
await page.waitForFunction(
  () => document.body.innerText.includes("已载入云端版本"),
  { timeout: 15000 },
);
check("云端 UI 载入", true);
await clickByText(page, "退出登录");
await page.waitForFunction(() => document.body.innerText.includes("已退出登录"), {
  timeout: 10000,
});

await page.goto(`${APP_URL}/templates`, {
  waitUntil: "domcontentloaded",
  timeout: 30000,
});
await page.waitForFunction(
  () => document.querySelectorAll("[data-catalog-card]").length > 0,
  { timeout: 30000 },
);
const catalogInfo = await page.evaluate(() => {
  const card = document.querySelector("[data-catalog-card]");
  const name = card?.querySelector("h2")?.textContent?.trim() ?? "";
  const preview = card?.querySelector("img")?.getAttribute("src") ?? null;
  const button = [...card.querySelectorAll("button")].find((item) =>
    item.textContent?.includes("使用此模板"),
  );
  button?.click();
  return { name, preview, clicked: Boolean(button) };
});
await page.waitForFunction(() => window.location.pathname === "/editor", {
  timeout: 20000,
});
await page.waitForFunction(
  () => Boolean(document.querySelector('input[aria-label="简历名称"]')),
  { timeout: 20000 },
);
const catalogApplied = await page.evaluate(
  (name) => document.body.innerText.includes(name),
  catalogInfo.name,
);
await sleep(1600);
const catalogSeeded = await page.evaluate(() => ({
  title: document.querySelector('input[aria-label="简历名称"]').value,
  textareas: [...document.querySelectorAll("textarea")].filter(
    (area) => area.value.trim().length > 0,
  ).length,
  pages: document.querySelectorAll("[data-resume-page]").length,
}));
await page.reload({ waitUntil: "networkidle2", timeout: 30000 });
await page.waitForFunction(
  (name) => document.body.innerText.includes(name),
  { timeout: 20000 },
  catalogInfo.name,
);
await sleep(900);
const fitPdfPath = path.join(shotDir, "resume-fit.pdf");
await page.pdf({
  path: fitPdfPath,
  printBackground: true,
  preferCSSPageSize: true,
});
const fitPdf = await PDFDocument.load(await readFile(fitPdfPath));
const fitPdfPages = fitPdf.getPageCount();
check(
  "全部模板库导入与使用",
  catalogInfo.clicked &&
    Boolean(catalogInfo.preview?.endsWith(".webp")) &&
    catalogApplied &&
    catalogInfo.name.length > 0 &&
    (catalogSeeded.title.includes("示例") || catalogSeeded.textareas > 0) &&
    catalogSeeded.pages === 1 &&
    fitPdfPages === 1,
  `${catalogInfo.name} · ${catalogSeeded.title} · 预览 ${catalogSeeded.pages} 页 · PDF ${fitPdfPages} 页 · ${catalogInfo.preview ?? "no-preview"}`,
);

const relevantErrors = runtimeErrors.filter(
  (text) =>
    !text.includes("favicon") &&
    !text.includes("status of 409") &&
    !text.includes("status of 404") &&
    !text.includes("status of 401"),
);
check("无运行时错误", relevantErrors.length === 0, relevantErrors.slice(0, 3).join(" | "));

await page.close();
browser.disconnect();

const passed = results.filter((item) => item.ok).length;
console.log(`\n${passed}/${results.length} checks passed`);
process.exit(process.exitCode ?? 0);

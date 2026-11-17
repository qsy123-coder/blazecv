/**
 * 邮箱验证码找回密码 + 登录后修改密码的端到端验证。
 *
 * 前置：应用服务接入本地 SMTP（脚本内置真实 SMTP 服务端）：
 *   EMAIL_PROVIDER=smtp
 *   EMAIL_SMTP_HOST=127.0.0.1
 *   EMAIL_SMTP_PORT=1025
 *   EMAIL_SMTP_SECURE=false
 *   EMAIL_FROM=no-reply@blazecv.local
 *
 * 用法：node scripts/verify-reset.mjs
 * 环境变量：APP_URL（默认 3000）、SMTP_CAPTURE_PORT（默认 1025）、
 *          EXPORT_CHROME_PATH（Edge 路径）、CDP_URL（可选，连接已有浏览器）。
 */
import puppeteer from "puppeteer-core";
import { SMTPServer } from "smtp-server";
import { mkdir } from "node:fs/promises";
import path from "node:path";

const APP_URL = process.env.APP_URL ?? "http://127.0.0.1:3000/";
const CDP_URL = process.env.CDP_URL ?? "";
const SMTP_PORT = Number(process.env.SMTP_CAPTURE_PORT ?? 1025);
const OUT_DIR = process.env.OUT_DIR ?? path.join(process.env.TEMP ?? ".", "blazecv-reset-check");
const EDGE =
  process.env.EXPORT_CHROME_PATH ??
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// ---------- 真实 SMTP 接收端 ----------
const inbox = [];
const smtpServer = new SMTPServer({
  authOptional: true,
  disabledCommands: ["STARTTLS"],
  onData(stream, session, callback) {
    let raw = "";
    stream.on("data", (chunk) => {
      raw += chunk.toString("utf8");
    });
    stream.on("end", () => {
      inbox.push({
        to: session.envelope.rcptTo.map((item) => item.address),
        raw,
        at: Date.now(),
      });
      callback();
    });
  },
});
await new Promise((resolve, reject) => {
  smtpServer.once("error", reject);
  smtpServer.listen(SMTP_PORT, "127.0.0.1", resolve);
});
console.log(`[smtp] listening on 127.0.0.1:${SMTP_PORT}`);

function decodeQuotedPrintable(input) {
  const bytes = input
    .replace(/=\r?\n/g, "")
    .replace(/=([0-9A-Fa-f]{2})/g, (_, hex) =>
      String.fromCharCode(parseInt(hex, 16)),
    );
  return Buffer.from(bytes, "latin1").toString("utf8");
}

function extractCandidates(raw) {
  const split = raw.indexOf("\r\n\r\n");
  const body = split >= 0 ? raw.slice(split + 4) : raw;
  const decoded = decodeQuotedPrintable(body);
  const candidates = new Map();
  for (const line of decoded.split(/\r?\n/)) {
    if (line.startsWith("--") || /^[A-Za-z-]+:/.test(line)) continue;
    for (const match of line.matchAll(/(?<!\d)(\d{6})(?!\d)/g)) {
      candidates.set(match[1], (candidates.get(match[1]) ?? 0) + 1);
    }
  }
  return [...candidates.entries()];
}

function extractCode(raw) {
  const split = raw.indexOf("\r\n\r\n");
  const decoded = decodeQuotedPrintable(split >= 0 ? raw.slice(split + 4) : raw);
  // 优先按模板里的固定措辞取码，避免把 CSS 颜色（如 #475569）当成验证码。
  const named = decoded.match(/验证码为[：:]\s*(\d{6})/);
  if (named) return named[1];
  const html = decoded.match(/letter-spacing:8px[^>]*>(\d{6})</);
  if (html) return html[1];
  const sorted = extractCandidates(raw).sort((a, b) => b[1] - a[1]);
  return sorted[0]?.[0] ?? "";
}

async function waitForMailCode(to, timeout = 20000) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    const mail = [...inbox].reverse().find((item) => item.to.includes(to));
    if (mail) {
      const code = extractCode(mail.raw);
      if (code) return code;
    }
    await sleep(150);
  }
  throw new Error(`等待 ${to} 的邮件验证码超时`);
}

// ---------- 浏览器 ----------
const viewport = { width: 1440, height: 900 };
const browser = CDP_URL
  ? await puppeteer.connect({ browserURL: CDP_URL, defaultViewport: viewport })
  : await puppeteer.launch({
      executablePath: EDGE,
      headless: true,
      defaultViewport: viewport,
      args: ["--no-first-run", "--disable-gpu", "--disable-dev-shm-usage"],
    });
const page = await browser.newPage();
page.on("pageerror", (error) => {
  console.log("[pageerror]", error.message);
  console.log(error.stack?.split("\n").slice(0, 6).join("\n"));
});
page.on("console", (message) => {
  if (message.type() === "error") console.log("[console]", message.text());
});
page.on("request", (request) => {
  if (request.url().includes("/api/auth/reset")) {
    console.log(`[request] ${request.url()} ${request.postData() ?? ""}`);
  }
});
page.on("response", async (response) => {
  const url = response.url();
  if (!url.includes("/api/auth/")) return;
  const body = await response.text().catch(() => "");
  console.log(`[api] ${response.status()} ${url} ${body.slice(0, 200)}`);
});

function randomDigits(length) {
  let out = "";
  for (let i = 0; i < length; i += 1) out += Math.floor(Math.random() * 10);
  return out;
}

async function clickPanelButton(label) {
  await page.evaluate((text) => {
    const overlay = [...document.body.children].find(
      (element) =>
        typeof element.className === "string" &&
        element.className.includes("fixed") &&
        element.className.includes("inset-0"),
    );
    if (!overlay) throw new Error("弹窗未打开");
    const panel = overlay.firstElementChild;
    const button = [...panel.querySelectorAll("button, summary")].find(
      (element) => element.textContent.trim() === text,
    );
    if (!button) throw new Error(`面板内找不到：${text}`);
    button.click();
  }, label);
}

async function fillPanelInput(selector, value) {
  const input = await page.waitForSelector(selector);
  await input.focus();
  await page.keyboard.down("Control");
  await page.keyboard.press("KeyA");
  await page.keyboard.up("Control");
  await page.keyboard.press("Backspace");
  await input.type(value);
  const current = await page.evaluate((element) => element.value, input);
  if (current !== value) {
    throw new Error(`输入未生效：期望 ${value}，实际 ${current}`);
  }
}

async function panelText() {
  return page.evaluate(() => {
    const overlay = [...document.body.children].find(
      (element) =>
        typeof element.className === "string" &&
        element.className.includes("fixed") &&
        element.className.includes("inset-0"),
    );
    return overlay ? overlay.firstElementChild.innerText : "";
  });
}

async function panelError() {
  return page.evaluate(() => {
    const overlay = [...document.body.children].find(
      (element) =>
        typeof element.className === "string" &&
        element.className.includes("fixed") &&
        element.className.includes("inset-0"),
    );
    if (!overlay) return "";
    const rose = [...overlay.firstElementChild.querySelectorAll("p")].find(
      (element) =>
        typeof element.className === "string" &&
        element.className.includes("bg-rose-50"),
    );
    return rose ? rose.innerText : "";
  });
}

const results = [];
const check = (name, pass, detail = "") => {
  results.push({ name, pass, detail });
  console.log(`${pass ? "PASS" : "FAIL"} ${name}${detail ? ` — ${detail}` : ""}`);
};

await mkdir(OUT_DIR, { recursive: true });

let attempts = 0;
for (;;) {
  try {
    await page.goto(APP_URL, { waitUntil: "networkidle2", timeout: 20000 });
    break;
  } catch (error) {
    attempts += 1;
    if (attempts > 20) throw error;
    await sleep(1000);
  }
}
try {
  await page.waitForSelector('button[title="云端同步"]', { timeout: 15000 });
} catch (error) {
  const state = await page.evaluate(() => ({
    url: location.href,
    title: document.title,
    text: document.body.innerText.slice(0, 200),
    buttons: document.querySelectorAll("button").length,
  }));
  console.log("[debug]", JSON.stringify(state));
  await page.screenshot({ path: path.join(OUT_DIR, "00-debug.png") });
  throw error;
}
let opened = false;
for (let i = 0; i < 30 && !opened; i += 1) {
  await page.click('button[title="云端同步"]');
  await sleep(300);
  opened = await page.evaluate(() =>
    [...document.body.children].some(
      (element) =>
        typeof element.className === "string" &&
        element.className.includes("fixed") &&
        element.className.includes("inset-0"),
    ),
  );
}
if (!opened) throw new Error("登录弹窗未打开");
if ((await panelText()).includes("退出登录")) {
  await clickPanelButton("退出登录");
  await sleep(500);
}

// 1. 注册一个邮箱账号
const email = `reset${randomDigits(7)}@qq.com`;
const password = "OriginPass123";
await clickPanelButton("邮箱登录");
await clickPanelButton("立即注册");
await fillPanelInput('input[placeholder="name@qq.com / name@163.com"]', email);
await fillPanelInput('input[type="password"]', password);
await clickPanelButton("创建账号");
await page.waitForFunction(
  (value) => document.body.innerText.includes(`已登录：${value}`),
  { timeout: 20000 },
  email,
);
check("邮箱注册成功", true, email);

// 2. 退出后走「忘记密码」发邮件验证码
await clickPanelButton("退出登录");
await sleep(600);
await clickPanelButton("忘记密码？");
await fillPanelInput('input[placeholder="name@qq.com / name@163.com"]', email);
inbox.length = 0;
await clickPanelButton("获取验证码");
let resetCode = "";
try {
  resetCode = await waitForMailCode(email);
  check("重置验证码邮件已送达", true, `${email} → ${resetCode}`);
} catch (error) {
  check("重置验证码邮件已送达", false, String(error.message));
  console.log("提示：请确认应用以 EMAIL_PROVIDER=smtp EMAIL_SMTP_HOST=127.0.0.1 EMAIL_SMTP_PORT=" + SMTP_PORT + " EMAIL_FROM=no-reply@blazecv.local 启动");
  await page.close();
  if (CDP_URL) browser.disconnect();
  else await browser.close();
  smtpServer.close();
  process.exit(1);
}

// 3. 错误验证码被拒绝
const wrongCode = resetCode === "000000" ? "111111" : "000000";
await fillPanelInput('input[placeholder="6 位验证码"]', wrongCode);
await fillPanelInput('input[placeholder="••••••••"]', "NewPass12345");
await clickPanelButton("重置密码");
await sleep(1200);
const wrongError = await panelError();
check("错误验证码不能重置密码", wrongError.includes("验证码错误"), wrongError || "无错误提示");

// 4. 正确验证码重置密码
await fillPanelInput('input[placeholder="6 位验证码"]', resetCode);
await fillPanelInput('input[placeholder="••••••••"]', "NewPass12345");
await clickPanelButton("重置密码");
await page.waitForFunction(
  () => document.body.innerText.includes("密码已重置，请用新密码登录"),
  { timeout: 20000 },
);
check("密码重置成功", true);
await page.screenshot({ path: path.join(OUT_DIR, "01-reset-done.png") });

// 5. 用新密码登录
await fillPanelInput('input[type="password"]', "NewPass12345");
await clickPanelButton("登录");
await page.waitForFunction(
  (value) => document.body.innerText.includes(`已登录：${value}`),
  { timeout: 20000 },
  email,
);
check("新密码登录成功", true);

// 6. 登录后修改密码
await clickPanelButton("修改密码");
await fillPanelInput('input[aria-label="当前密码"]', "NewPass12345");
await fillPanelInput('input[aria-label="新密码"]', "FinalPass12345");
await clickPanelButton("保存");
await page.waitForFunction(
  () => document.body.innerText.includes("密码已更新"),
  { timeout: 20000 },
);
check("登录后修改密码", true);
await page.screenshot({ path: path.join(OUT_DIR, "02-password-changed.png") });

// 7. 用修改后的密码重新登录
await clickPanelButton("退出登录");
await sleep(600);
await fillPanelInput('input[type="password"]', "FinalPass12345");
await clickPanelButton("登录");
await page.waitForFunction(
  (value) => document.body.innerText.includes(`已登录：${value}`),
  { timeout: 20000 },
  email,
);
check("修改后的密码可登录", true);

// 收尾
await clickPanelButton("退出登录");
await sleep(500);

const failed = results.filter((item) => !item.pass);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
console.log(`screenshots: ${OUT_DIR}`);
await page.close();
if (CDP_URL) browser.disconnect();
else await browser.close();
smtpServer.close();
process.exit(failed.length === 0 ? 0 : 1);

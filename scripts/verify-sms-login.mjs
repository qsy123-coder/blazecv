/**
 * 手机号 + 短信验证码登录的端到端验证。
 *
 * 前置：应用服务用通用 HTTP 短信网关指向本脚本的接收端，例如
 *   SMS_PROVIDER=http
 *   SMS_HTTP_URL=http://127.0.0.1:9109/send
 *   SMS_CODE_RESEND_SECONDS=2        # 测试时缩短重发冷却
 *
 * 用法：node scripts/verify-sms-login.mjs
 * 环境变量：CDP_URL（可选，提供则连接已有浏览器）、APP_URL（默认 3000）、
 *          SMS_CAPTURE_PORT（默认 9109）、EXPORT_CHROME_PATH（Edge 路径）。
 */
import puppeteer from "puppeteer-core";
import { createServer } from "node:http";
import { mkdir } from "node:fs/promises";
import path from "node:path";

const CDP_URL = process.env.CDP_URL ?? "";
const APP_URL = process.env.APP_URL ?? "http://127.0.0.1:3000/";
const CAPTURE_PORT = Number(process.env.SMS_CAPTURE_PORT ?? 9109);
const EDGE =
  process.env.EXPORT_CHROME_PATH ??
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
const OUT_DIR = process.env.OUT_DIR ?? path.join(process.env.TEMP ?? ".", "blazecv-sms-check");

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** 模拟短信网关：接收 { phone, code }，记录后返回 200。 */
const captured = new Map();
const captureServer = createServer((request, response) => {
  if (request.method !== "POST" || !request.url?.startsWith("/send")) {
    response.writeHead(404, { "Content-Type": "application/json" });
    response.end('{"error":"not found"}');
    return;
  }
  let body = "";
  request.on("data", (chunk) => {
    body += chunk;
  });
  request.on("end", () => {
    try {
      const data = JSON.parse(body || "{}");
      if (typeof data.phone === "string" && typeof data.code === "string") {
        captured.set(data.phone, { code: data.code, at: Date.now() });
        console.log(`[gateway] ${data.phone} 收到验证码 ${data.code}`);
      }
      response.writeHead(200, { "Content-Type": "application/json" });
      response.end('{"ok":true}');
    } catch {
      response.writeHead(400, { "Content-Type": "application/json" });
      response.end('{"error":"bad json"}');
    }
  });
});
await new Promise((resolve, reject) => {
  captureServer.once("error", reject);
  captureServer.listen(CAPTURE_PORT, "127.0.0.1", resolve);
});
console.log(`[gateway] listening on http://127.0.0.1:${CAPTURE_PORT}/send`);

async function waitForCapturedCode(phone, timeout = 15000) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    const hit = captured.get(phone);
    if (hit) return hit.code;
    await sleep(100);
  }
  throw new Error(`等待 ${phone} 的验证码超时`);
}

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
const apiStatuses = [];
page.on("request", (request) => {
  if (request.url().includes("/api/auth/login")) {
    console.log(`[request] ${request.url()} ${request.postData() ?? ""}`);
  }
});
page.on("response", async (response) => {
  const url = response.url();
  if (!url.includes("/api/auth/")) return;
  apiStatuses.push({ url, status: response.status() });
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
    const button = [...panel.querySelectorAll("button")].find(
      (element) => element.textContent.trim() === text,
    );
    if (!button) throw new Error(`面板内找不到按钮：${text}`);
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

async function panelError() {
  return page.evaluate(() => {
    const overlay = [...document.body.children].find(
      (element) =>
        typeof element.className === "string" &&
        element.className.includes("fixed") &&
        element.className.includes("inset-0"),
    );
    if (!overlay) return "";
    const panel = overlay.firstElementChild;
    const rose = [...panel.querySelectorAll("p")].find((element) =>
      typeof element.className === "string" && element.className.includes("bg-rose-50"),
    );
    return rose ? rose.innerText : "";
  });
}

async function panelText() {
  return page.evaluate(() => {
    const overlay = [...document.body.children].find(
      (element) =>
        typeof element.className === "string" &&
        element.className.includes("fixed") &&
        element.className.includes("inset-0"),
    );
    if (!overlay) return "";
    return overlay.firstElementChild.innerText;
  });
}

const results = [];
const check = (name, pass, detail = "") => {
  results.push({ name, pass, detail });
  console.log(`${pass ? "PASS" : "FAIL"} ${name}${detail ? ` — ${detail}` : ""}`);
};

await mkdir(OUT_DIR, { recursive: true });

// 打开应用并确保未登录
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
await page.waitForSelector('button[title="云端同步"]', { timeout: 15000 });
await page.click('button[title="云端同步"]');
await page.waitForFunction(() => document.body.innerText.includes("手机号登录"), {
  timeout: 15000,
});
if ((await panelText()).includes("退出登录")) {
  await clickPanelButton("退出登录");
  await sleep(500);
}

// 1. 发送验证码
const phone = `139${randomDigits(8)}`;
await fillPanelInput('input[placeholder="请输入 11 位手机号"]', phone);
await clickPanelButton("获取验证码");
let sentCode = "";
try {
  sentCode = await waitForCapturedCode(phone);
  check("验证码短信已通过网关下发", true, phone);
} catch (error) {
  check("验证码短信已通过网关下发", false, String(error.message));
  console.log("提示：请确认应用以 SMS_PROVIDER=http SMS_HTTP_URL=http://127.0.0.1:" + CAPTURE_PORT + "/send 启动");
  await page.close();
  if (CDP_URL) browser.disconnect();
  else await browser.close();
  captureServer.close();
  process.exit(1);
}

// 2. 重发冷却生效
await sleep(500);
const cooldownText = await panelText();
check(
  "重发冷却生效",
  /s 后重发/.test(cooldownText),
  cooldownText.match(/\d+s 后重发/)?.[0] ?? "未找到倒计时",
);

// 3. 错误验证码被拒绝
const wrongCode = sentCode === "000000" ? "111111" : "000000";
await fillPanelInput('input[placeholder="6 位验证码"]', wrongCode);
await clickPanelButton("登录");
await sleep(1200);
const wrongError = await panelError();
check("错误验证码被拒绝", wrongError.includes("验证码错误"), wrongError || "无错误提示");

// 4. 正确验证码登录（自动注册）
await fillPanelInput('input[placeholder="6 位验证码"]', sentCode);
await clickPanelButton("登录");
await page.waitForFunction(
  (value) => document.body.innerText.includes(`已登录：${value}`),
  { timeout: 20000 },
  phone,
);
check("手机号验证码登录成功（自动建号）", true, phone);
await page.screenshot({ path: path.join(OUT_DIR, "01-phone-logged-in.png") });

// 5. 退出后再次用验证码登录（已有账号路径）
await clickPanelButton("退出登录");
await sleep(800);
await fillPanelInput('input[placeholder="请输入 11 位手机号"]', phone);
captured.delete(phone); // 只认这次新下发的码，避免拿到上一轮的旧码
await clickPanelButton("获取验证码");
const secondCode = await waitForCapturedCode(phone, 20000);
await fillPanelInput('input[placeholder="6 位验证码"]', secondCode);
const typedCode = await page.$eval('input[placeholder="6 位验证码"]', (element) => element.value);
console.log(`[probe] captured=${secondCode} typed=${typedCode}`);
await clickPanelButton("登录");
try {
  await page.waitForFunction(
    (value) => document.body.innerText.includes(`已登录：${value}`),
    { timeout: 20000 },
    phone,
  );
} catch (error) {
  console.log("[probe] 面板错误：", await panelError());
  throw error;
}
check("已有手机号再次验证码登录", true, phone);
await page.screenshot({ path: path.join(OUT_DIR, "02-phone-relogin.png") });

// 收尾：退出登录
await clickPanelButton("退出登录");
await sleep(500);

const failed = results.filter((item) => !item.pass);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
console.log(`screenshots: ${OUT_DIR}`);
await page.close();
if (CDP_URL) browser.disconnect();
else await browser.close();
captureServer.close();
process.exit(failed.length === 0 ? 0 : 1);

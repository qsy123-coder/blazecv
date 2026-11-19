/**
 * 会员支付 UI 冒烟：未登录引导 → 登录 → 下单 → mock 支付 → 会员生效。
 *
 * 前置：应用以 PAY_ENABLED=true PAY_PROVIDER=mock 启动，且 CDP 可用。
 *   APP_URL=http://127.0.0.1:3100 CDP_URL=http://127.0.0.1:9227 node scripts/verify-pay-ui.mjs
 */
import puppeteer from "puppeteer-core";

const BASE = (process.env.APP_URL ?? "http://127.0.0.1:3100").replace(/\/$/, "");
const CDP_URL = process.env.CDP_URL ?? "http://127.0.0.1:9227";

const results = [];
const check = (name, pass, detail = "") => {
  results.push({ name, pass });
  console.log(`${pass ? "PASS" : "FAIL"} ${name}${detail ? ` — ${detail}` : ""}`);
};

function randomDigits(length) {
  let out = "";
  for (let i = 0; i < length; i += 1) out += Math.floor(Math.random() * 10);
  return out;
}

async function register() {
  const email = `payUi${randomDigits(8)}@qq.com`;
  const response = await fetch(`${BASE}/api/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ account: email, password: "PayVerify123" }),
  });
  const entries =
    typeof response.headers.getSetCookie === "function"
      ? response.headers.getSetCookie()
      : [response.headers.get("set-cookie") ?? ""];
  let cookie = "";
  for (const entry of entries) {
    const match = entry.match(/blazecv_session=([^;]+)/);
    if (match) cookie = match[1];
  }
  return { email, cookie };
}

const browser = await puppeteer.connect({
  browserURL: CDP_URL,
  defaultViewport: { width: 1366, height: 900 },
  protocolTimeout: 120000,
});
const page = await browser.newPage();
const errors = [];
page.on("pageerror", (error) => errors.push(String(error.message ?? error)));
page.on("console", (message) => {
  if (message.type() === "error") errors.push(message.text());
});

try {
  const staleCookies = await page.cookies(BASE);
  if (staleCookies.length > 0) await page.deleteCookie(...staleCookies);
  await page.goto(`${BASE}/membership`, { waitUntil: "networkidle2", timeout: 60000 });
  await page.waitForFunction(
    () => document.body.innerText.includes("BlazeCV 会员"),
    { timeout: 20000 },
  );
  const initial = await page.evaluate(() => document.body.innerText);
  check(
    "会员页渲染月卡与年卡",
    initial.includes("月卡会员") &&
      initial.includes("年卡会员") &&
      initial.includes("¥9.9") &&
      initial.includes("¥68"),
  );

  const clickedLogin = await page.evaluate(() => {
    const button = [...document.querySelectorAll("button")].find((item) =>
      item.textContent?.includes("立即开通"),
    );
    button?.click();
    return Boolean(button);
  });
  await page.waitForFunction(
    () => document.body.innerText.includes("登录 / 注册"),
    { timeout: 10000 },
  );
  check("未登录点开通会打开登录面板", clickedLogin);
  await page.keyboard.press("Escape");

  const account = await register();
  check("注册 UI 验收账号", Boolean(account.cookie), account.email);
  await page.setCookie({ name: "blazecv_session", value: account.cookie, url: BASE });
  await page.reload({ waitUntil: "networkidle2" });
  await page.waitForFunction(
    () => document.body.innerText.includes("当前为免费版"),
    { timeout: 20000 },
  );

  const methodCount = await page.evaluate(
    () =>
      [...document.querySelectorAll("button")].filter((item) =>
        ["微信支付", "支付宝"].includes(item.textContent?.trim() ?? ""),
      ).length,
  );
  check("会员页提供微信/支付宝切换", methodCount === 2, `count=${methodCount}`);

  const clickedAlipay = await page.evaluate(() => {
    const button = [...document.querySelectorAll("button")].find(
      (item) => item.textContent?.trim() === "支付宝",
    );
    button?.click();
    return Boolean(button);
  });
  check("切换到支付宝", clickedAlipay);
  await page.waitForFunction(
    () =>
      [...document.querySelectorAll("button")].some((item) =>
        item.textContent?.includes("立即开通 · 支付宝"),
      ),
    { timeout: 10000 },
  );

  const clickedPlan = await page.evaluate(() => {
    const button = [...document.querySelectorAll("button")].find((item) => {
      if (!item.textContent?.includes("立即开通")) return false;
      const card = item.closest('div[class*="rounded-xl"]');
      return Boolean(card?.textContent?.includes("年卡会员"));
    });
    button?.click();
    return Boolean(button);
  });
  check("点击年卡立即开通", clickedPlan);

  try {
    await page.waitForFunction(
      () => document.body.innerText.includes("支付宝扫码支付"),
      { timeout: 20000 },
    );
  } catch (error) {
    const debug = await page.evaluate(() => document.body.innerText);
    console.log("DEBUG page text:\n" + debug.slice(0, 2000));
    throw error;
  }
  const dialogText = await page.evaluate(() => document.body.innerText);
  check(
    "支付宝弹窗显示金额与订单号",
    dialogText.includes("年卡会员") &&
      dialogText.includes("¥68") &&
      dialogText.includes("订单号") &&
      dialogText.includes("请使用支付宝扫一扫"),
  );

  const clickedMock = await page.evaluate(() => {
    const button = [...document.querySelectorAll("button")].find((item) =>
      item.textContent?.includes("模拟支付成功"),
    );
    button?.click();
    return Boolean(button);
  });
  check("点击模拟支付", clickedMock);

  await page.waitForFunction(
    () => document.body.innerText.includes("开通成功"),
    { timeout: 20000 },
  );
  check("支付成功态出现", true);

  const clickedDone = await page.evaluate(() => {
    const button = [...document.querySelectorAll("button")].find(
      (item) => item.textContent?.trim() === "完成",
    );
    button?.click();
    return Boolean(button);
  });
  check("关闭支付弹窗", clickedDone);

  await page.waitForFunction(
    () => document.body.innerText.includes("会员有效"),
    { timeout: 20000 },
  );
  const after = await page.evaluate(() => document.body.innerText);
  check("会员状态与到期时间显示", after.includes("会员有效") && after.includes("到期时间"));
  check("页面无运行时错误", errors.length === 0, errors.slice(0, 2).join(" | "));
} finally {
  await page.close().catch(() => undefined);
  browser.disconnect();
}

const failed = results.filter((item) => !item.pass);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
if (failed.length > 0) {
  console.error("FAILED:", failed.map((item) => item.name).join(" | "));
  process.exit(1);
}

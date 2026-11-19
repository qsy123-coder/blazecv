/**
 * 易支付网关连通性/协议自检（不改数据库，不下发会员）。
 *
 * 用法：
 *   EPAY_GATEWAY=https://pay.example.com \
 *   EPAY_PID=1001 \
 *   EPAY_KEY=yourkey \
 *   node scripts/probe-epay.mjs
 *
 * 可选：
 *   EPAY_WECHAT_TYPE=wxpay
 *   PROBE_NOTIFY_URL=https://aetouban.cn/api/pay/notify/epay
 *
 * 成功输出 code=1 + 二维码内容；失败会打印网关原始返回和排查提示。
 */
import crypto from "node:crypto";

const gateway = (process.env.EPAY_GATEWAY ?? "").trim().replace(/\/+$/, "");
const pid = (process.env.EPAY_PID ?? "").trim();
const key = (process.env.EPAY_KEY ?? "").trim();
const type = (process.env.EPAY_WECHAT_TYPE ?? "wxpay").trim();
const notifyUrl =
  (process.env.PROBE_NOTIFY_URL ?? "https://aetouban.cn/api/pay/notify/epay").trim();
const returnUrl =
  (process.env.PROBE_RETURN_URL ?? "https://aetouban.cn/membership").trim();

if (!gateway || !pid || !key) {
  console.error("缺少 EPAY_GATEWAY / EPAY_PID / EPAY_KEY");
  process.exit(2);
}

const md5 = (text) => crypto.createHash("md5").update(text, "utf8").digest("hex");

const outTradeNo = `PROBE${Date.now()}${Math.floor(Math.random() * 900 + 100)}`;
const params = {
  pid,
  type,
  out_trade_no: outTradeNo,
  notify_url: notifyUrl,
  return_url: returnUrl,
  name: "BlazeCV 网关自检",
  money: "0.01",
  clientip: "127.0.0.1",
  device: "pc",
  sitename: "BlazeCV",
};

const base = Object.entries(params)
  .filter(([, value]) => String(value) !== "")
  .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
  .map(([name, value]) => `${name}=${value}`)
  .join("&");
params.sign = md5(`${base}${key}`);
params.sign_type = "MD5";

console.log(`POST ${gateway}/mapi.php  out_trade_no=${outTradeNo}`);

let response;
try {
  response = await fetch(`${gateway}/mapi.php`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(params).toString(),
    signal: AbortSignal.timeout(20_000),
  });
} catch (error) {
  console.error(`请求失败：${error.name}: ${error.message}`);
  console.error("检查：网关域名是否正确、是否 HTTPS、本机能否访问、是否需要 IP 白名单。");
  process.exit(1);
}

const text = await response.text();
console.log(`HTTP ${response.status}  Content-Type: ${response.headers.get("content-type") ?? ""}`);

let data;
try {
  data = JSON.parse(text);
} catch {
  console.error("返回不是 JSON（多半是 HTML 支付页或错误页），前 400 字符：");
  console.error(text.slice(0, 400));
  console.error("说明：该网关可能没有开放 mapi.php，或 EPAY_GATEWAY 指向了收银台而不是 API 域名。");
  process.exit(1);
}

console.log(JSON.stringify(data, null, 2));

if (Number(data.code) !== 1) {
  console.error(`下单失败：${data.msg ?? data.message ?? "未知错误"}`);
  console.error("常见原因：商户号/密钥错误、通道未开通、域名未授权、金额低于最低限额、签名算法不同。");
  process.exit(1);
}

const codeUrl = data.qrcode || data.payurl || data.urlscheme;
console.log("\n网关协议正常。二维码内容：");
console.log(codeUrl || "(返回里没有 qrcode/payurl/urlscheme)");
console.log("\n用微信扫这个内容对应的二维码付 0.01，确认能拉起支付；");
console.log("然后到网关后台确认订单状态为已支付。");

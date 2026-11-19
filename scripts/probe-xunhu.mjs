/**
 * 虎皮椒（XunhuPay）网关自检：真实下一笔 0.01 的 WAP 单，不写数据库。
 *
 * 用法：
 *   XUNHU_APPID=... XUNHU_APPSECRET=... node scripts/probe-xunhu.mjs
 *
 * 可选：
 *   XUNHU_API_BASE=https://api.xunhupay.com
 *   XUNHU_NOTIFY_URL=https://aetouban.cn/api/pay/notify/xunhu
 *   XUNHU_WECHAT_TYPE=WAP
 */
import crypto from "node:crypto";

const appid = (process.env.XUNHU_APPID ?? "").trim();
const secret = (process.env.XUNHU_APPSECRET ?? "").trim();
const base = (process.env.XUNHU_API_BASE ?? "https://api.xunhupay.com").replace(/\/+$/, "");
const notifyUrl =
  (process.env.XUNHU_NOTIFY_URL ?? "https://aetouban.cn/api/pay/notify/xunhu").trim();
const type = (process.env.XUNHU_WECHAT_TYPE ?? "WAP").trim();

if (!appid || !secret) {
  console.error("缺少 XUNHU_APPID / XUNHU_APPSECRET");
  process.exit(2);
}

const md5 = (text) => crypto.createHash("md5").update(text, "utf8").digest("hex");

function sign(params) {
  const body = Object.entries(params)
    .filter(([name, value]) => name !== "hash" && String(value) !== "")
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([name, value]) => `${name}=${String(value)}`)
    .join("&");
  return md5(`${body}${secret}`);
}

const outTradeNo = `PROBEXH${Date.now()}${Math.floor(Math.random() * 900 + 100)}`;
// 官方最新示例：JSON 提交，支付类型由 APPID 绑定的渠道决定，不传 type。
const params = {
  version: "1.1",
  appid,
  trade_order_id: outTradeNo,
  total_fee: "0.01",
  title: "BlazeCV 网关自检",
  time: String(Math.floor(Date.now() / 1000)),
  notify_url: notifyUrl,
  return_url: "https://aetouban.cn/membership",
  nonce_str: crypto.randomBytes(16).toString("hex").slice(0, 32),
};
params.hash = sign(params);

console.log(`POST ${base}/payment/do.html  trade_order_id=${outTradeNo}`);

let response;
try {
  response = await fetch(`${base}/payment/do.html`, {
    method: "POST",
    headers: { "Content-Type": "application/json;charset=UTF-8" },
    body: JSON.stringify(params),
    signal: AbortSignal.timeout(20_000),
  });
} catch (error) {
  console.error(`请求失败：${error.name}: ${error.message}`);
  process.exit(1);
}

const text = await response.text();
console.log(`HTTP ${response.status}`);
let data;
try {
  data = JSON.parse(text);
} catch {
  console.error("返回不是 JSON，前 400 字符：");
  console.error(text.slice(0, 400));
  process.exit(1);
}
console.log(JSON.stringify(data, null, 2));

if (Number(data.errcode) !== 0) {
  console.error(`下单失败：${data.errmsg ?? "未知错误"}`);
  console.error("常见原因：APPID/密钥错误、通道未开通、type 不对、域名/回调不合规。");
  process.exit(1);
}

if (data.hash) {
  const flat = {};
  for (const [name, value] of Object.entries(data)) {
    if (typeof value === "string" || typeof value === "number") flat[name] = String(value);
  }
  if (String(data.hash).toLowerCase() !== sign(flat)) {
    console.error("响应 hash 校验失败（网关返回签名与本地算法不一致）");
    process.exit(1);
  }
}

console.log("\n网关协议正常。");
console.log("支付页 URL:", data.url || "(无)");
console.log("二维码内容:", data.url_qrcode || "(无)");
console.log("\n用微信扫 url_qrcode 付 0.01，确认能拉起支付；然后到虎皮椒后台确认订单。");

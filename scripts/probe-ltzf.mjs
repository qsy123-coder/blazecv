/**
 * 蓝兔支付网关自检（真实下一笔 0.01 的 Native 单，不写数据库）。
 *
 * 用法：
 *   LTZF_MCH_ID=你的商户号 \
 *   LTZF_KEY=你的密钥 \
 *   LTZF_NOTIFY_URL=https://aetouban.cn/api/pay/notify/ltzf \
 *   node scripts/probe-ltzf.mjs
 *
 * 可选：
 *   LTZF_API_BASE=https://api.ltzf.cn
 */
import crypto from "node:crypto";

const mchId = (process.env.LTZF_MCH_ID ?? "").trim();
const key = (process.env.LTZF_KEY ?? "").trim();
const base = (process.env.LTZF_API_BASE ?? "https://api.ltzf.cn").replace(/\/+$/, "");
const notifyUrl = (
  process.env.LTZF_NOTIFY_URL ?? "https://aetouban.cn/api/pay/notify/ltzf"
).trim();

if (!mchId || !key) {
  console.error("缺少 LTZF_MCH_ID / LTZF_KEY");
  process.exit(2);
}

const md5Upper = (text) =>
  crypto.createHash("md5").update(text, "utf8").digest("hex").toUpperCase();

function sign(params) {
  const body = Object.entries(params)
    .filter(([name, value]) => name !== "sign" && String(value) !== "")
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([name, value]) => `${name}=${String(value)}`)
    .join("&");
  return md5Upper(`${body}&key=${key}`);
}

const outTradeNo = `PROBELTZF${Date.now()}${Math.floor(Math.random() * 900 + 100)}`;
const params = {
  mch_id: mchId,
  out_trade_no: outTradeNo,
  total_fee: "0.01",
  body: "BlazeCV 网关自检",
  timestamp: String(Math.floor(Date.now() / 1000)),
  notify_url: notifyUrl,
};
params.sign = sign(params);

console.log(`POST ${base}/api/wxpay/native  out_trade_no=${outTradeNo}`);

let response;
try {
  response = await fetch(`${base}/api/wxpay/native`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(params).toString(),
    signal: AbortSignal.timeout(20_000),
  });
} catch (error) {
  console.error(`请求失败：${error.name}: ${error.message}`);
  console.error("检查：服务器出口 IP 是否已加入蓝兔后台白名单。");
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

if (Number(data.code) !== 0) {
  console.error(`下单失败：${data.msg ?? "未知错误"}`);
  console.error("常见原因：商户号/密钥错误、未签约微信通道、域名或 IP 未加白名单。");
  process.exit(1);
}

console.log("\n网关协议正常。二维码内容：");
console.log(data.data?.code_url || data.data?.QRcode_url || "(无)");
console.log("\n用微信扫码付 0.01，确认能拉起支付；然后到蓝兔后台确认订单已支付。");

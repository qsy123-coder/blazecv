/**
 * 对账补齐（回调丢失兜底）。
 *
 * 应用需设置 PAY_ADMIN_TOKEN，并已配置可查单的通道
 * （易支付 / PayJS / 虎皮椒；免签通道没有查单接口，结果恒为 unknown）。
 *
 * 运行：
 *   APP_URL=https://aetouban.cn PAY_ADMIN_TOKEN=... node scripts/reconcile-orders.mjs
 * 可选：
 *   LIMIT=100
 */
const BASE = (process.env.APP_URL ?? "http://127.0.0.1:3000").replace(/\/$/, "");
const TOKEN = (process.env.PAY_ADMIN_TOKEN ?? "").trim();
const LIMIT = process.env.LIMIT ?? "50";

if (!TOKEN) {
  console.error("缺少 PAY_ADMIN_TOKEN");
  process.exit(2);
}

const response = await fetch(`${BASE}/api/pay/reconcile?limit=${encodeURIComponent(LIMIT)}`, {
  method: "POST",
  headers: { "x-admin-token": TOKEN },
});

const text = await response.text();
let data;
try {
  data = JSON.parse(text);
} catch {
  data = { raw: text };
}

console.log(`status=${response.status} ${JSON.stringify(data)}`);
if (!response.ok || data.ok !== true) {
  process.exit(1);
}

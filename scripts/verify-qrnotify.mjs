/**
 * 个人收款码监听（免签）通道验收。
 *
 * 应用启动参数：
 *   PAY_ENABLED=true PAY_PROVIDER=qrnotify
 *   QR_NOTIFY_SECRET=testsecret
 *   QR_NOTIFY_WECHAT_QR=wxp://f2f0test
 *   QR_NOTIFY_MATCH=amount
 *   npm run start
 * 运行：
 *   APP_URL=http://127.0.0.1:3105 node scripts/verify-qrnotify.mjs
 */
import crypto from "node:crypto";

const BASE = (process.env.APP_URL ?? "http://127.0.0.1:3105").replace(/\/$/, "");
const SECRET = process.env.QR_NOTIFY_SECRET ?? "testsecret";
const QR_CONTENT = process.env.QR_NOTIFY_WECHAT_QR ?? "wxp://f2f0test";

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

function sessionCookie(response) {
  const entries =
    typeof response.headers.getSetCookie === "function"
      ? response.headers.getSetCookie()
      : [response.headers.get("set-cookie") ?? ""];
  for (const entry of entries) {
    const match = entry.match(/blazecv_session=([^;]+)/);
    if (match) return `blazecv_session=${match[1]}`;
  }
  return "";
}

async function call(path, { method = "GET", body, cookie } = {}) {
  const response = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      ...(body ? { "Content-Type": "application/json" } : {}),
      ...(cookie ? { Cookie: cookie } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await response.json().catch(() => ({}));
  return { status: response.status, json, cookie: sessionCookie(response) };
}

function signedBody(payload, { timestamp, nonce } = {}) {
  const raw = JSON.stringify(payload);
  const ts = timestamp ?? String(Math.floor(Date.now() / 1000));
  const n = nonce ?? crypto.randomBytes(8).toString("hex");
  const signature = crypto
    .createHmac("sha256", SECRET)
    .update(`${ts}.${n}.${raw}`, "utf8")
    .digest("hex");
  return {
    raw,
    headers: {
      "Content-Type": "application/json",
      "x-qr-timestamp": ts,
      "x-qr-nonce": n,
      "x-qr-signature": signature,
    },
  };
}

async function notify(payload, options) {
  const { raw, headers } = signedBody(payload, options);
  const response = await fetch(`${BASE}/api/pay/notify/qrnotify`, {
    method: "POST",
    headers,
    body: raw,
  });
  return { status: response.status, json: await response.json().catch(() => ({})) };
}

try {
  const email = `qr${randomDigits(8)}@qq.com`;
  const registered = await call("/api/auth/register", {
    method: "POST",
    body: { account: email, password: "PayVerify123" },
  });
  check("注册验收账号", registered.status === 200 && Boolean(registered.cookie));
  const cookie = registered.cookie;

  const created = await call("/api/pay/orders", {
    method: "POST",
    cookie,
    body: { plan: "month" },
  });
  const order = created.json.order;
  check(
    "免签下单成功并渲染个人收款码",
    created.status === 200 &&
      order?.status === "pending" &&
      order?.codeUrl === QR_CONTENT,
    `status=${created.status}, codeUrl=${order?.codeUrl}`,
  );
  check(
    "应付金额带唯一尾数（990–1039 分）",
    Number.isInteger(order?.amountFen) &&
      order.amountFen >= 991 &&
      order.amountFen <= 1039,
    `amountFen=${order?.amountFen}`,
  );

  const unauthenticated = await fetch(`${BASE}/api/pay/notify/qrnotify`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ amount_fen: order?.amountFen, trade_no: "no-auth" }),
  });
  check("无签名回调被拒绝", unauthenticated.status === 401, `status=${unauthenticated.status}`);

  const tampered = signedBody({ amount_fen: order?.amountFen, trade_no: "tamper" });
  const tamperedResponse = await fetch(`${BASE}/api/pay/notify/qrnotify`, {
    method: "POST",
    headers: tampered.headers,
    body: tampered.raw.replace(String(order?.amountFen), "1"),
  });
  check("篡改报文后验签失败", tamperedResponse.status === 401, `status=${tamperedResponse.status}`);

  const wrongAmount = await notify({
    amount_fen: 1,
    trade_no: `wrong_${randomDigits(6)}`,
  });
  check(
    "金额不匹配时不发货",
    wrongAmount.status === 200 && wrongAmount.json.matched === false,
    `status=${wrongAmount.status}, body=${JSON.stringify(wrongAmount.json)}`,
  );

  const paidTradeNo = `qr_tx_${randomDigits(8)}`;
  const paid = await notify({
    amount_fen: order?.amountFen,
    trade_no: paidTradeNo,
    remark: "验收",
  });
  check(
    "正确金额回调匹配订单",
    paid.status === 200 &&
      paid.json.success === true &&
      paid.json.matched === true &&
      paid.json.outTradeNo === order?.outTradeNo,
    `status=${paid.status}, body=${JSON.stringify(paid.json)}`,
  );

  const after = await call(`/api/pay/orders/${order?.id}`, { cookie });
  const days = after.json.membership?.expiresAt
    ? (new Date(after.json.membership.expiresAt).getTime() - Date.now()) / 86400000
    : 0;
  check(
    "订单变为已支付且会员生效",
    after.json.order?.status === "paid" &&
      after.json.membership?.active === true &&
      days > 29.9,
    `orderStatus=${after.json.order?.status}, days=${days.toFixed(2)}`,
  );

  const replay = await notify({
    amount_fen: order?.amountFen,
    trade_no: paidTradeNo,
  });
  const afterReplay = await call(`/api/pay/orders/${order?.id}`, { cookie });
  const replayDays = afterReplay.json.membership?.expiresAt
    ? (new Date(afterReplay.json.membership.expiresAt).getTime() - Date.now()) / 86400000
    : 0;
  check(
    "重复回调幂等，不会重复叠加会员",
    replay.status === 200 && Math.abs(replayDays - days) < 0.1,
    `first=${days.toFixed(2)}, replay=${replayDays.toFixed(2)}`,
  );

  const second = await call("/api/pay/orders", {
    method: "POST",
    cookie,
    body: { plan: "year" },
  });
  const secondOrder = second.json.order;
  check("第二笔订单创建成功", Boolean(secondOrder?.id) && secondOrder?.status === "pending");
  const tokenGet = await fetch(
    `${BASE}/api/pay/notify/qrnotify?token=${encodeURIComponent(SECRET)}` +
      `&amount=${(secondOrder.amountFen / 100).toFixed(2)}` +
      `&trade_no=token_${randomDigits(6)}`,
  );
  const tokenJson = await tokenGet.json().catch(() => ({}));
  check(
    "GET + token 模式可用（兼容不能签名的监听 App）",
    tokenGet.status === 200 &&
      tokenJson.success === true &&
      tokenJson.matched === true &&
      tokenJson.outTradeNo === secondOrder?.outTradeNo,
    `status=${tokenGet.status}, body=${JSON.stringify(tokenJson)}`,
  );
} finally {
  /* 无外部服务需要关闭 */
}

const failed = results.filter((item) => !item.pass);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
if (failed.length > 0) {
  console.error("FAILED:", failed.map((item) => item.name).join(" | "));
  process.exit(1);
}

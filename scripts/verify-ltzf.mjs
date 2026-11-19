/**
 * 蓝兔支付（LTZF）适配器验收（本地假网关，不访问真实服务）。
 *
 * 应用启动参数：
 *   PAY_ENABLED=true PAY_PROVIDER=ltzf
 *   LTZF_MCH_ID=3001
 *   LTZF_KEY=ltzfkey
 *   LTZF_API_BASE=http://127.0.0.1:9333
 *   LTZF_NOTIFY_URL=http://127.0.0.1:3104/api/pay/notify/ltzf
 * 运行：
 *   APP_URL=http://127.0.0.1:3104 node scripts/verify-ltzf.mjs
 */
import crypto from "node:crypto";
import http from "node:http";

const BASE = (process.env.APP_URL ?? "http://127.0.0.1:3104").replace(/\/$/, "");
const STUB_PORT = Number(process.env.STUB_PORT ?? 9333);
const MCH_ID = process.env.LTZF_MCH_ID ?? "3001";
const KEY = process.env.LTZF_KEY ?? "ltzfkey";

const results = [];
const check = (name, pass, detail = "") => {
  results.push({ name, pass });
  console.log(`${pass ? "PASS" : "FAIL"} ${name}${detail ? ` — ${detail}` : ""}`);
};

const md5Upper = (text) =>
  crypto.createHash("md5").update(text, "utf8").digest("hex").toUpperCase();

function sign(params) {
  const base = Object.entries(params)
    .filter(([name, value]) => name !== "sign" && String(value) !== "")
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([name, value]) => `${name}=${String(value)}`)
    .join("&");
  return md5Upper(`${base}&key=${KEY}`);
}

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

function sendJson(response, status, value) {
  response.statusCode = status;
  response.setHeader("Content-Type", "application/json");
  response.end(JSON.stringify(value));
}

const orders = new Map();
const requests = [];

const server = http.createServer((request, response) => {
  let raw = "";
  request.on("data", (c) => (raw += c));
  request.on("end", () => {
    const url = new URL(request.url ?? "/", `http://127.0.0.1:${STUB_PORT}`);
    const form = Object.fromEntries(new URLSearchParams(raw));
    const entry = { path: url.pathname, form, signValid: sign(form) === form.sign };
    requests.push(entry);

    if (url.pathname === "/api/wxpay/native") {
      if (!entry.signValid) return sendJson(response, 200, { code: 1, msg: "sign error" });
      return sendJson(response, 200, {
        code: 0,
        msg: "微信Native下单成功",
        data: {
          code_url: "weixin://wxpay/bizpayurl?pr=ltzf-test",
          QRcode_url: "https://ltzf.test/qr/1.png",
        },
        request_id: `req_${randomDigits(6)}`,
      });
    }

    if (url.pathname === "/api/wxpay/get_pay_order") {
      if (!entry.signValid) return sendJson(response, 200, { code: 1, msg: "sign error" });
      const order = orders.get(form.out_trade_no);
      return sendJson(response, 200, {
        code: 0,
        msg: "查询成功",
        data: {
          out_trade_no: form.out_trade_no,
          pay_status: 1,
          total_fee: order ? (order.amountFen / 100).toFixed(2) : "9.90",
          pay_no: `ltzf_pay_${form.out_trade_no}`,
          trade_type: "NATIVE",
        },
      });
    }

    sendJson(response, 404, { code: 1, msg: "not found" });
  });
});
await new Promise((resolve) => server.listen(STUB_PORT, "127.0.0.1", resolve));

async function pushNotify(tradeNo, amountFen) {
  const params = {
    code: "0",
    timestamp: String(Math.floor(Date.now() / 1000)),
    mch_id: MCH_ID,
    order_no: `WX${randomDigits(12)}`,
    out_trade_no: tradeNo,
    pay_no: `420000${randomDigits(10)}`,
    total_fee: (amountFen / 100).toFixed(2),
  };
  params.sign = sign(params);
  const response = await fetch(`${BASE}/api/pay/notify/ltzf`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(params).toString(),
  });
  return { status: response.status, text: await response.text() };
}

try {
  const email = `ltzf${randomDigits(8)}@qq.com`;
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
    "蓝兔下单成功",
    created.status === 200 && order?.status === "pending" && Boolean(order?.codeUrl),
    `status=${created.status}, codeUrl=${order?.codeUrl}`,
  );
  if (order?.outTradeNo) {
    orders.set(order.outTradeNo, { amountFen: order.amountFen });
  }

  const createRequest = requests.find((item) => item.path === "/api/wxpay/native");
  check("下单请求通过假网关验签", Boolean(createRequest?.signValid));
  check(
    "下单字段 mch_id/out_trade_no/total_fee 正确",
    createRequest?.form?.mch_id === MCH_ID &&
      createRequest.form.out_trade_no === order?.outTradeNo &&
      createRequest.form.total_fee === (order.amountFen / 100).toFixed(2),
    `mch_id=${createRequest?.form?.mch_id}, total_fee=${createRequest?.form?.total_fee}`,
  );
  check(
    "回调地址指向 /api/pay/notify/ltzf",
    createRequest?.form?.notify_url?.endsWith("/api/pay/notify/ltzf"),
    createRequest?.form?.notify_url,
  );

  const queried = await call(`/api/pay/orders/${order?.id}`, { cookie });
  check(
    "查单返回已支付并开通会员",
    queried.status === 200 &&
      queried.json.order?.status === "paid" &&
      queried.json.membership?.active === true,
    `orderStatus=${queried.json.order?.status}, active=${queried.json.membership?.active}`,
  );
  const queryRequest = requests.find(
    (item) => item.path === "/api/wxpay/get_pay_order",
  );
  check("查单请求通过假网关验签", Boolean(queryRequest?.signValid));

  const second = await call("/api/pay/orders", {
    method: "POST",
    cookie,
    body: { plan: "year" },
  });
  const secondOrder = second.json.order;
  check("第二笔订单创建成功", Boolean(secondOrder?.id));
  if (secondOrder?.outTradeNo) {
    orders.set(secondOrder.outTradeNo, { amountFen: secondOrder.amountFen });
  }

  const notify = await pushNotify(secondOrder?.outTradeNo, secondOrder?.amountFen);
  check(
    "异步回调验签并返回 SUCCESS",
    notify.status === 200 && notify.text.trim() === "SUCCESS",
    `status=${notify.status}, body=${notify.text.slice(0, 60)}`,
  );

  const afterNotify = await call(`/api/pay/orders/${secondOrder?.id}`, { cookie });
  const days = afterNotify.json.membership?.expiresAt
    ? (new Date(afterNotify.json.membership.expiresAt).getTime() - Date.now()) / 86400000
    : 0;
  check(
    "回调发货：年卡叠加后会员有效",
    afterNotify.json.order?.status === "paid" &&
      afterNotify.json.membership?.active === true &&
      days > 394.9,
    `orderStatus=${afterNotify.json.order?.status}, days=${days.toFixed(2)}`,
  );

  const forged = await fetch(`${BASE}/api/pay/notify/ltzf`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code: "0",
      mch_id: MCH_ID,
      out_trade_no: "x",
      total_fee: "0.01",
      sign: "DEADBEEF",
    }).toString(),
  });
  check("伪造回调签名被拒绝", forged.status === 401, `status=${forged.status}`);
} finally {
  await new Promise((resolve) => server.close(resolve));
}

const failed = results.filter((item) => !item.pass);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
if (failed.length > 0) {
  console.error("FAILED:", failed.map((item) => item.name).join(" | "));
  process.exit(1);
}

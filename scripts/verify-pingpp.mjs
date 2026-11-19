/**
 * Ping++ 适配器验收（本地假网关，不访问 Ping++）：
 * - 校验请求签名 body+path+timestamp；
 * - 校验 wx_pub_qr 下单字段；
 * - 查单 paid=true 后开通会员；
 * - 构造带 Ping++ 签名的 charge.succeeded Webhook，校验发货；
 * - 伪造签名必须失败。
 *
 * 前置：应用以 PAY_PROVIDER=pingpp 启动，并设置
 *   PINGPP_API_KEY=sk_test_pingpp
 *   PINGPP_APP_ID=app_test
 *   PINGPP_API_BASE=http://127.0.0.1:9320
 *   PINGPP_PRIVATE_KEY_PATH=.data/pingpp-keys/merchant_private.pem
 *   PINGPP_PUBLIC_KEY_PATH=.data/pingpp-keys/pingpp_public.pem
 * 运行：
 *   APP_URL=http://127.0.0.1:3103 node scripts/verify-pingpp.mjs
 */
import crypto from "node:crypto";
import fs from "node:fs";
import http from "node:http";

const BASE = (process.env.APP_URL ?? "http://127.0.0.1:3103").replace(/\/$/, "");
const STUB_PORT = Number(process.env.STUB_PORT ?? 9320);
const MERCHANT_PUBLIC_KEY_PATH =
  process.env.TEST_MERCHANT_PUBLIC_KEY ??
  ".data/pingpp-keys/merchant_public.pem";
const PINGPP_PRIVATE_KEY_PATH =
  process.env.TEST_PINGPP_PRIVATE_KEY ?? ".data/pingpp-keys/pingpp_private.pem";
const EXPECT_API_KEY = process.env.PINGPP_API_KEY ?? "sk_test_pingpp";
const EXPECT_APP_ID = process.env.PINGPP_APP_ID ?? "app_test";

const results = [];
const check = (name, pass, detail = "") => {
  results.push({ name, pass });
  console.log(`${pass ? "PASS" : "FAIL"} ${name}${detail ? ` — ${detail}` : ""}`);
};

const merchantPublicKey = fs.readFileSync(MERCHANT_PUBLIC_KEY_PATH, "utf8");
const pingppPrivateKey = fs.readFileSync(PINGPP_PRIVATE_KEY_PATH, "utf8");
const charges = new Map();
const requests = [];

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

async function call(path, { method = "GET", body, cookie, headers = {} } = {}) {
  const response = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      ...(body ? { "Content-Type": "application/json" } : {}),
      ...(cookie ? { Cookie: cookie } : {}),
      ...headers,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await response.json().catch(() => ({}));
  return { status: response.status, json, cookie: sessionCookie(response) };
}

function json(response, status, value) {
  response.statusCode = status;
  response.setHeader("Content-Type", "application/json");
  response.end(JSON.stringify(value));
}

const server = http.createServer((request, response) => {
  let raw = "";
  request.on("data", (chunk) => {
    raw += chunk;
  });
  request.on("end", () => {
    const url = new URL(request.url ?? "/", `http://127.0.0.1:${STUB_PORT}`);
    const timestamp = request.headers["pingplusplus-request-timestamp"] ?? "";
    const signature = request.headers["pingplusplus-signature"] ?? "";
    const signed = `${raw}${url.pathname}${timestamp}`;
    const signatureValid = Boolean(
      signature &&
        crypto.verify(
          "RSA-SHA256",
          Buffer.from(signed, "utf8"),
          merchantPublicKey,
          Buffer.from(String(signature), "base64"),
        ),
    );
    const authOk =
      request.headers.authorization ===
      `Basic ${Buffer.from(`${EXPECT_API_KEY}:`).toString("base64")}`;
    const entry = {
      method: request.method,
      path: url.pathname,
      raw,
      body: raw ? JSON.parse(raw) : null,
      signatureValid,
      authOk,
    };
    requests.push(entry);

    if (!authOk) return json(response, 401, { error: { type: "unauthorized" } });
    if (!signatureValid) {
      return json(response, 401, { error: { type: "invalid-signature" } });
    }

    if (request.method === "POST" && url.pathname === "/v1/charges") {
      const body = entry.body;
      const charge = {
        id: `ch_test_${charges.size + 1}`,
        object: "charge",
        order_no: body.order_no,
        amount: body.amount,
        paid: false,
        refunded: false,
        time_paid: null,
        credential: {
          [body.channel]:
            body.channel === "alipay_qr"
              ? "https://qr.alipay.com/pingpp-test"
              : "weixin://wxpay/bizpayurl?pr=pingpp-test",
        },
      };
      charges.set(charge.id, charge);
      return json(response, 200, charge);
    }

    const chargeMatch = url.pathname.match(/^\/v1\/charges\/([^/]+)$/);
    if (request.method === "GET" && chargeMatch) {
      const charge = charges.get(decodeURIComponent(chargeMatch[1]));
      if (!charge) return json(response, 404, { error: { type: "not_found" } });
      return json(response, 200, {
        ...charge,
        paid: true,
        transaction_no: "tx_pingpp_test",
        time_paid: Math.floor(Date.now() / 1000),
      });
    }

    const refundMatch = url.pathname.match(/^\/v1\/charges\/([^/]+)\/refunds$/);
    if (request.method === "POST" && refundMatch) {
      return json(response, 200, {
        id: "re_test_1",
        object: "refund",
        charge: decodeURIComponent(refundMatch[1]),
        amount: entry.body?.amount,
        status: "succeeded",
      });
    }

    json(response, 404, { error: { type: "not_found" } });
  });
});
await new Promise((resolve) => server.listen(STUB_PORT, "127.0.0.1", resolve));

try {
  const email = `pingpp${randomDigits(8)}@qq.com`;
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
    "Ping++ 下单成功",
    created.status === 200 && order?.status === "pending" && Boolean(order?.codeUrl),
    `status=${created.status}, orderStatus=${order?.status}, codeUrl=${order?.codeUrl}`,
  );

  const createRequest = requests.find(
    (item) => item.method === "POST" && item.path === "/v1/charges",
  );
  check("请求带 Ping++ 签名并通过假网关验签", Boolean(createRequest?.signatureValid));
  check("请求使用 Basic API Key", Boolean(createRequest?.authOk));
  check(
    "下单字段 app/channel/amount/order_no 正确",
    createRequest?.body?.app?.id === EXPECT_APP_ID &&
      createRequest?.body?.channel === "wx_pub_qr" &&
      createRequest?.body?.amount === 990 &&
      createRequest?.body?.order_no === order?.outTradeNo,
    `app=${createRequest?.body?.app?.id}, channel=${createRequest?.body?.channel}, amount=${createRequest?.body?.amount}`,
  );
  check(
    "下单带 client_ip/time_expire/subject",
    typeof createRequest?.body?.client_ip === "string" &&
      Number.isInteger(createRequest?.body?.time_expire) &&
      createRequest?.body?.subject?.includes("月卡"),
    `ip=${createRequest?.body?.client_ip}, expire=${createRequest?.body?.time_expire}, subject=${createRequest?.body?.subject}`,
  );

  const alipay = await call("/api/pay/orders", {
    method: "POST",
    cookie,
    body: { plan: "month", channel: "alipay" },
  });
  const alipayOrder = alipay.json.order;
  const alipayRequest = [...requests]
    .reverse()
    .find(
      (item) =>
        item.method === "POST" &&
        item.path === "/v1/charges" &&
        item.body?.channel === "alipay_qr",
    );
  check(
    "支付宝下单成功并使用 alipay_qr",
    alipay.status === 200 &&
      alipayOrder?.channel === "alipay" &&
      String(alipayOrder?.codeUrl).startsWith("https://qr.alipay.com/") &&
      Boolean(alipayRequest?.signatureValid),
    `status=${alipay.status}, channel=${alipayOrder?.channel}, pingppChannel=${alipayRequest?.body?.channel}`,
  );

  const queried = await call(`/api/pay/orders/${order?.id}`, { cookie });
  const queryRequest = requests.find(
    (item) => item.method === "GET" && item.path.startsWith("/v1/charges/"),
  );
  check(
    "查单调用 GET /v1/charges/{id} 且已验签",
    Boolean(queryRequest?.signatureValid) &&
      queryRequest?.path === `/v1/charges/${charges.keys().next().value}`,
    `path=${queryRequest?.path}, signature=${queryRequest?.signatureValid}`,
  );
  check(
    "查单 paid=true 后会员生效",
    queried.status === 200 &&
      queried.json.order?.status === "paid" &&
      queried.json.membership?.active === true,
    `orderStatus=${queried.json.order?.status}, active=${queried.json.membership?.active}`,
  );

  // 第二笔订单用于 Webhook：假网关创建后保持未支付，再手动推送 charge.succeeded。
  const second = await call("/api/pay/orders", {
    method: "POST",
    cookie,
    body: { plan: "year" },
  });
  const secondOrder = second.json.order;
  const secondCharge = [...charges.values()].find(
    (charge) => charge.order_no === secondOrder?.outTradeNo,
  );
  check("第二笔订单创建成功", Boolean(secondOrder?.id && secondCharge?.id));

  const event = {
    id: `evt_pingpp_${randomDigits(6)}`,
    object: "event",
    type: "charge.succeeded",
    data: {
      object: {
        ...secondCharge,
        paid: true,
        transaction_no: "tx_pingpp_webhook",
        time_paid: Math.floor(Date.now() / 1000),
      },
    },
  };
  const rawEvent = JSON.stringify(event);
  const webhookSignature = crypto
    .sign("RSA-SHA256", Buffer.from(rawEvent, "utf8"), pingppPrivateKey)
    .toString("base64");

  const webhook = await fetch(`${BASE}/api/pay/notify/pingpp`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-pingplusplus-signature": webhookSignature,
    },
    body: rawEvent,
  });
  const webhookJson = await webhook.json().catch(() => ({}));
  check(
    "Ping++ Webhook 验签并返回成功",
    webhook.status === 200 && webhookJson.success === true,
    `status=${webhook.status}, body=${JSON.stringify(webhookJson)}`,
  );

  const afterWebhook = await call(`/api/pay/orders/${secondOrder?.id}`, { cookie });
  const days = afterWebhook.json.membership?.expiresAt
    ? (new Date(afterWebhook.json.membership.expiresAt).getTime() - Date.now()) /
      86400000
    : 0;
  check(
    "Webhook 发货：年卡叠加后会员有效",
    afterWebhook.json.order?.status === "paid" &&
      afterWebhook.json.membership?.active === true &&
      days > 394.9,
    `orderStatus=${afterWebhook.json.order?.status}, days=${days.toFixed(2)}`,
  );

  const forged = await fetch(`${BASE}/api/pay/notify/pingpp`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-pingplusplus-signature": "Zm9yZ2Vk",
    },
    body: rawEvent,
  });
  check("伪造 Webhook 签名被拒绝", forged.status === 401, `status=${forged.status}`);
} finally {
  await new Promise((resolve) => server.close(resolve));
}

const failed = results.filter((item) => !item.pass);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
if (failed.length > 0) {
  console.error("FAILED:", failed.map((item) => item.name).join(" | "));
  process.exit(1);
}

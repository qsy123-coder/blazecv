/**
 * 服务商模式（partner）联调桩：
 * - 启动假微信网关 127.0.0.1:9310，记录请求；
 * - 通过 HTTP 创建订单，校验 /v3/pay/partner/transactions/native 的字段；
 * - 触发查单，校验 partner 查单 URL 与会员发货。
 *
 * 前置：应用以 WECHAT_PAY_MODE=partner 启动，并设置
 *   WECHAT_PAY_API_BASE=http://127.0.0.1:9310
 *   WECHAT_PAY_SP_APPID / WECHAT_PAY_SP_MCHID / WECHAT_PAY_SUB_MCHID
 *   WECHAT_PAY_API_V3_KEY / WECHAT_PAY_MCH_SERIAL_NO / WECHAT_PAY_NOTIFY_URL
 *   WECHAT_PAY_MCH_PRIVATE_KEY_PATH / WECHAT_PAY_PUBLIC_KEY_PATH
 * 运行：
 *   APP_URL=http://127.0.0.1:3102 node scripts/verify-wechat-partner.mjs
 */
import http from "node:http";

const BASE = (process.env.APP_URL ?? "http://127.0.0.1:3102").replace(/\/$/, "");
const STUB_PORT = Number(process.env.STUB_PORT ?? 9310);
const SP_MCHID = process.env.EXPECT_SP_MCHID ?? process.env.WECHAT_PAY_SP_MCHID ?? "";
const SUB_MCHID = process.env.EXPECT_SUB_MCHID ?? process.env.WECHAT_PAY_SUB_MCHID ?? "";
const SP_APPID = process.env.EXPECT_SP_APPID ?? process.env.WECHAT_PAY_SP_APPID ?? "";

const results = [];
const check = (name, pass, detail = "") => {
  results.push({ name, pass });
  console.log(`${pass ? "PASS" : "FAIL"} ${name}${detail ? ` — ${detail}` : ""}`);
};

const requests = [];
const server = http.createServer((request, response) => {
  let raw = "";
  request.on("data", (chunk) => {
    raw += chunk;
  });
  request.on("end", () => {
    const url = new URL(request.url ?? "/", `http://127.0.0.1:${STUB_PORT}`);
    const entry = {
      method: request.method,
      path: url.pathname,
      query: url.searchParams,
      authorization: request.headers.authorization ?? "",
      body: raw ? JSON.parse(raw) : null,
    };
    requests.push(entry);
    response.setHeader("Content-Type", "application/json");

    if (url.pathname === "/v3/pay/partner/transactions/native") {
      response.end(JSON.stringify({ code_url: "weixin://wxpay/bizpayurl?pr=partner-test" }));
      return;
    }
    if (url.pathname.startsWith("/v3/pay/partner/transactions/out-trade-no/")) {
      response.end(
        JSON.stringify({
          trade_state: "SUCCESS",
          transaction_id: "TX_PARTNER_TEST",
          amount: { total: 990 },
        }),
      );
      return;
    }
    response.statusCode = 404;
    response.end(JSON.stringify({ code: "NOT_FOUND" }));
  });
});
await new Promise((resolve) => server.listen(STUB_PORT, "127.0.0.1", resolve));

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

try {
  const email = `partner${randomDigits(8)}@qq.com`;
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
    "服务商模式下单成功",
    created.status === 200 && order?.status === "pending" && Boolean(order?.codeUrl),
    `status=${created.status}, orderStatus=${order?.status}`,
  );

  const native = requests.find(
    (item) => item.path === "/v3/pay/partner/transactions/native",
  );
  check("调用 partner Native 下单接口", Boolean(native));
  if (native) {
    check(
      "下单字段 sp_appid/sp_mchid/sub_mchid 正确",
      native.body?.sp_appid === SP_APPID &&
        native.body?.sp_mchid === SP_MCHID &&
        native.body?.sub_mchid === SUB_MCHID,
      `sp_appid=${native.body?.sp_appid}, sp_mchid=${native.body?.sp_mchid}, sub_mchid=${native.body?.sub_mchid}`,
    );
    check(
      "下单金额为分且订单号一致",
      native.body?.amount?.total === 990 &&
        native.body?.out_trade_no === order?.outTradeNo,
      `amount=${native.body?.amount?.total}, outTradeNo=${native.body?.out_trade_no}`,
    );
    check(
      "请求带服务商签名头",
      String(native.authorization).startsWith("WECHATPAY2-SHA256-RSA2048") &&
        String(native.authorization).includes(`mchid="${SP_MCHID}"`),
      String(native.authorization).slice(0, 60),
    );
  }

  const queried = await call(`/api/pay/orders/${order?.id}`, { cookie });
  const queryRequest = requests.find((item) =>
    item.path.startsWith("/v3/pay/partner/transactions/out-trade-no/"),
  );
  check(
    "查单走 partner 接口并带 sp_mchid/sub_mchid",
    Boolean(queryRequest) &&
      queryRequest.query.get("sp_mchid") === SP_MCHID &&
      queryRequest.query.get("sub_mchid") === SUB_MCHID,
    `sp_mchid=${queryRequest?.query.get("sp_mchid")}, sub_mchid=${queryRequest?.query.get("sub_mchid")}`,
  );
  check(
    "查单成功后会员生效",
    queried.status === 200 &&
      queried.json.order?.status === "paid" &&
      queried.json.membership?.active === true,
    `orderStatus=${queried.json.order?.status}, active=${queried.json.membership?.active}`,
  );
} finally {
  await new Promise((resolve) => server.close(resolve));
}

const failed = results.filter((item) => !item.pass);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
if (failed.length > 0) {
  console.error("FAILED:", failed.map((item) => item.name).join(" | "));
  process.exit(1);
}

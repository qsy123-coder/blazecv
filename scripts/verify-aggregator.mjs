/**
 * 第三方个人聚合通道验收（本地假网关，不访问真实服务）。
 *
 * 支持 MODE=epay|payjs|xunhu，对应：
 *   epay  : 易支付 / 彩虹易支付（mapi.php + api.php + GET 回调）
 *   payjs : PayJS（/native + /check + 表单回调）
 *   xunhu : 虎皮椒（/payment/do.html + /payment/query.html + 表单回调）
 *
 * 应用需以对应 PAY_PROVIDER 启动，例如易支付：
 *   PAY_ENABLED=true PAY_PROVIDER=epay
 *   EPAY_GATEWAY=http://127.0.0.1:9330 EPAY_PID=1001 EPAY_KEY=epaytestkey
 *   EPAY_NOTIFY_URL=http://127.0.0.1:3104/api/pay/notify/epay
 *   npm run start
 * 运行：
 *   MODE=epay APP_URL=http://127.0.0.1:3104 node scripts/verify-aggregator.mjs
 */
import crypto from "node:crypto";
import http from "node:http";

const MODE = (process.env.MODE ?? process.env.AGG ?? "epay").toLowerCase();
const BASE = (process.env.APP_URL ?? "http://127.0.0.1:3104").replace(/\/$/, "");
const STUB_PORT = Number(
  process.env.STUB_PORT ??
    (MODE === "payjs" ? 9331 : MODE === "xunhu" ? 9332 : 9330),
);

const CONFIG = {
  epay: {
    pid: process.env.EPAY_PID ?? "1001",
    key: process.env.EPAY_KEY ?? "epaytestkey",
  },
  payjs: {
    mchid: process.env.PAYJS_MCHID ?? "2001",
    key: process.env.PAYJS_KEY ?? "payjstestkey",
  },
  xunhu: {
    appid: process.env.XUNHU_APPID ?? "xhappid",
    secret: process.env.XUNHU_APPSECRET ?? "xhsecret",
  },
}[MODE];

if (!CONFIG) {
  console.error("MODE 必须是 epay、payjs 或 xunhu");
  process.exit(2);
}

const results = [];
const check = (name, pass, detail = "") => {
  results.push({ name, pass });
  console.log(`${pass ? "PASS" : "FAIL"} ${name}${detail ? ` — ${detail}` : ""}`);
};

const md5 = (text) => crypto.createHash("md5").update(text, "utf8").digest("hex");
const md5Upper = (text) =>
  crypto.createHash("md5").update(text, "utf8").digest("hex").toUpperCase();

function signRecord(params, secret, { upper = false, appendKey = false } = {}) {
  const base = Object.entries(params)
    .filter(([name, value]) => {
      if (name === "sign" || name === "sign_type" || name === "hash") return false;
      return value !== undefined && value !== null && String(value) !== "";
    })
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([name, value]) => `${name}=${String(value)}`)
    .join("&");
  const text = appendKey ? `${base}&key=${secret}` : `${base}${secret}`;
  return upper ? md5Upper(text) : md5(text);
}

function epaySign(params) {
  return signRecord(params, CONFIG.key);
}
function payjsSign(params) {
  return signRecord(params, CONFIG.key, { upper: true, appendKey: true });
}
function xunhuSign(params) {
  return signRecord(params, CONFIG.secret);
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

const requests = [];

function parseForm(raw) {
  const record = {};
  new URLSearchParams(raw).forEach((value, name) => {
    record[name] = value;
  });
  return record;
}

function handleStub(request, response) {
  let raw = "";
  request.on("data", (chunk) => {
    raw += chunk;
  });
  request.on("end", () => {
    const url = new URL(request.url ?? "/", `http://127.0.0.1:${STUB_PORT}`);
    const contentType = String(request.headers["content-type"] ?? "");
    let form;
    if (contentType.includes("json") || raw.trim().startsWith("{")) {
      try {
        form = JSON.parse(raw);
      } catch {
        form = {};
      }
    } else {
      form = parseForm(raw);
    }
    const entry = { method: request.method, path: url.pathname, query: url.search, form, raw };
    requests.push(entry);

    if (MODE === "epay") {
      const params = Object.keys(form).length ? form : Object.fromEntries(url.searchParams);
      if (request.method === "POST" && url.pathname === "/mapi.php") {
        if (epaySign(params) !== params.sign) {
          return sendJson(response, 401, { code: 0, msg: "sign error" });
        }
        entry.signValid = true;
        return sendJson(response, 200, {
          code: 1,
          trade_no: `epay_${randomDigits(8)}`,
          qrcode: "weixin://wxpay/bizpayurl?pr=epay-test",
          payurl: "https://epay.test/pay/1",
        });
      }
      if (request.method === "GET" && url.pathname === "/api.php" && params.act === "order") {
        entry.signValid = params.key === CONFIG.key;
        const order = orders.get(params.out_trade_no);
        return sendJson(response, 200, {
          code: 1,
          data: {
            status: 1,
            money: order ? (order.amountFen / 100).toFixed(2) : "9.90",
            trade_no: `epay_q_${params.out_trade_no}`,
            out_trade_no: params.out_trade_no,
          },
        });
      }
      return sendJson(response, 404, { code: 0, msg: "not found" });
    }

    if (MODE === "payjs") {
      if (request.method === "POST" && url.pathname === "/native") {
        if (payjsSign(form) !== form.sign) {
          return sendJson(response, 401, { return_code: 0, return_msg: "sign error" });
        }
        entry.signValid = true;
        return sendJson(response, 200, {
          return_code: 1,
          payjs_order_id: `payjs_${randomDigits(8)}`,
          code_url: "weixin://wxpay/bizpayurl?pr=payjs-test",
          qrcode: "https://payjs.test/qr/1.png",
        });
      }
      if (request.method === "POST" && url.pathname === "/check") {
        entry.signValid = payjsSign(form) === form.sign;
        return sendJson(response, 200, {
          return_code: 1,
          status: 1,
          out_trade_no: form.out_trade_no,
          payjs_order_id: form.payjs_order_id ?? `payjs_q_${form.out_trade_no}`,
          transaction_id: `payjs_tx_${form.out_trade_no ?? form.payjs_order_id}`,
          total_fee: orders.get(form.out_trade_no)?.amountFen ?? 990,
        });
      }
      if (request.method === "POST" && url.pathname === "/refund") {
        entry.signValid = payjsSign(form) === form.sign;
        return sendJson(response, 200, { return_code: 1 });
      }
      return sendJson(response, 404, { return_code: 0, return_msg: "not found" });
    }

    // xunhu
    if (request.method === "POST" && url.pathname === "/payment/do.html") {
      if (xunhuSign(form) !== form.hash) {
        return sendJson(response, 200, { errcode: 1, errmsg: "hash error" });
      }
      entry.signValid = true;
      return sendJson(response, 200, {
        errcode: 0,
        errmsg: "success",
        url: "https://xunhu.test/pay/1",
        url_qrcode: "weixin://wxpay/bizpayurl?pr=xunhu-test",
      });
    }
    if (request.method === "POST" && url.pathname === "/payment/query.html") {
      entry.signValid = xunhuSign(form) === form.hash;
      return sendJson(response, 200, {
        errcode: 0,
        errmsg: "success",
        data: {
          status: "OD",
          total_fee: ((orders.get(form.out_trade_order)?.amountFen ?? 990) / 100).toFixed(2),
          transaction_id: `xunhu_tx_${form.out_trade_order}`,
          out_trade_order: form.out_trade_order,
        },
      });
    }
    return sendJson(response, 404, { errcode: 1, errmsg: "not found" });
  });
}

const orders = new Map();
const server = http.createServer(handleStub);
await new Promise((resolve) => server.listen(STUB_PORT, "127.0.0.1", resolve));

function buildNotify(orderTradeNo, amountFen) {
  if (MODE === "epay") {
    const params = {
      pid: CONFIG.pid,
      trade_no: `epay_notify_${randomDigits(6)}`,
      out_trade_no: orderTradeNo,
      type: "wxpay",
      name: "月卡会员",
      money: (amountFen / 100).toFixed(2),
      trade_status: "TRADE_SUCCESS",
    };
    params.sign = epaySign(params);
    params.sign_type = "MD5";
    return { method: "GET", path: `/api/pay/notify/epay?${new URLSearchParams(params)}` };
  }
  if (MODE === "payjs") {
    const params = {
      return_code: "1",
      out_trade_no: orderTradeNo,
      payjs_order_id: `payjs_notify_${randomDigits(6)}`,
      transaction_id: `tx_${randomDigits(6)}`,
      total_fee: String(amountFen),
      time_end: String(Math.floor(Date.now() / 1000)),
      mchid: CONFIG.mchid,
    };
    params.sign = payjsSign(params);
    return { method: "POST", path: "/api/pay/notify/payjs", form: params };
  }
  const params = {
    trade_order_id: orderTradeNo,
    total_fee: (amountFen / 100).toFixed(2),
    transaction_id: `xunhu_notify_${randomDigits(6)}`,
    open_order_id: `open_${randomDigits(6)}`,
    status: "OD",
    plugins: "wechat",
    appid: CONFIG.appid,
    time: String(Math.floor(Date.now() / 1000)),
    nonce_str: crypto.randomBytes(8).toString("hex"),
  };
  params.hash = xunhuSign(params);
  return { method: "POST", path: "/api/pay/notify/xunhu", form: params };
}

async function pushNotify(tradeNo, amountFen) {
  const notify = buildNotify(tradeNo, amountFen);
  if (notify.method === "GET") {
    const response = await fetch(`${BASE}${notify.path}`);
    return { status: response.status, text: await response.text() };
  }
  const response = await fetch(`${BASE}${notify.path}`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(notify.form).toString(),
  });
  return { status: response.status, text: await response.text() };
}

try {
  const email = `agg${randomDigits(8)}@qq.com`;
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
    `${MODE} 下单成功`,
    created.status === 200 && order?.status === "pending" && Boolean(order?.codeUrl),
    `status=${created.status}, orderStatus=${order?.status}, codeUrl=${order?.codeUrl}`,
  );
  if (order?.outTradeNo) {
    orders.set(order.outTradeNo, { amountFen: order.amountFen });
  }

  const createRequest = [...requests]
    .reverse()
    .find((item) =>
      MODE === "epay"
        ? item.path === "/mapi.php"
        : MODE === "payjs"
          ? item.path === "/native"
          : item.path === "/payment/do.html",
    );
  check("下单请求通过假网关验签", Boolean(createRequest?.signValid));

  if (MODE === "epay") {
    check(
      "易支付下单字段 pid/type/money/out_trade_no 正确",
      createRequest?.form?.pid === CONFIG.pid &&
        createRequest.form.type === "wxpay" &&
        createRequest.form.money === (order.amountFen / 100).toFixed(2) &&
        createRequest.form.out_trade_no === order?.outTradeNo,
      `pid=${createRequest?.form?.pid}, type=${createRequest?.form?.type}, money=${createRequest?.form?.money}`,
    );
    check(
      "回调地址指向 /api/pay/notify/epay",
      createRequest?.form?.notify_url?.endsWith("/api/pay/notify/epay"),
      createRequest?.form?.notify_url,
    );
  }
  if (MODE === "payjs") {
    check(
      "PayJS 下单字段 mchid/total_fee/out_trade_no 正确",
      createRequest?.form?.mchid === CONFIG.mchid &&
        createRequest.form.total_fee === String(order.amountFen) &&
        createRequest.form.out_trade_no === order?.outTradeNo,
      `mchid=${createRequest?.form?.mchid}, total_fee=${createRequest?.form?.total_fee}`,
    );
  }
  if (MODE === "xunhu") {
    check(
      "虎皮椒下单字段 appid/total_fee/trade_order_id 正确",
      createRequest?.form?.appid === CONFIG.appid &&
        createRequest.form.total_fee === (order.amountFen / 100).toFixed(2) &&
        createRequest.form.trade_order_id === order?.outTradeNo,
      `appid=${createRequest?.form?.appid}, total_fee=${createRequest?.form?.total_fee}`,
    );
  }

  const queried = await call(`/api/pay/orders/${order?.id}`, { cookie });
  check(
    "查单返回已支付并开通会员",
    queried.status === 200 &&
      queried.json.order?.status === "paid" &&
      queried.json.membership?.active === true,
    `orderStatus=${queried.json.order?.status}, active=${queried.json.membership?.active}`,
  );
  const queryRequest = [...requests]
    .reverse()
    .find((item) =>
      MODE === "epay"
        ? item.path === "/api.php"
        : MODE === "payjs"
          ? item.path === "/check"
          : item.path === "/payment/query.html",
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
    "异步回调验签并返回 success",
    notify.status === 200 && notify.text.trim().toLowerCase() === "success",
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

  if (process.env.PAY_ADMIN_TOKEN) {
    const unauthenticated = await fetch(`${BASE}/api/pay/reconcile`, {
      method: "POST",
    });
    check("对账接口无令牌被拒绝", unauthenticated.status === 401, `status=${unauthenticated.status}`);

    const pending = await call("/api/pay/orders", {
      method: "POST",
      cookie,
      body: { plan: "month" },
    });
    const pendingOrder = pending.json.order;
    if (pendingOrder?.outTradeNo) {
      orders.set(pendingOrder.outTradeNo, { amountFen: pendingOrder.amountFen });
    }

    const reconciled = await fetch(`${BASE}/api/pay/reconcile?limit=20`, {
      method: "POST",
      headers: { "x-admin-token": process.env.PAY_ADMIN_TOKEN },
    });
    const summary = await reconciled.json().catch(() => ({}));
    check(
      "对账补齐主动查单并发货",
      reconciled.status === 200 &&
        summary.ok === true &&
        summary.checked >= 1 &&
        summary.paid >= 1,
      `status=${reconciled.status}, body=${JSON.stringify(summary)}`,
    );

    const afterReconcile = await call(`/api/pay/orders/${pendingOrder?.id}`, { cookie });
    check(
      "对账后订单变为已支付",
      afterReconcile.json.order?.status === "paid",
      `orderStatus=${afterReconcile.json.order?.status}`,
    );
  }

  if (MODE === "epay") {
    const forged = await fetch(
      `${BASE}/api/pay/notify/epay?pid=${CONFIG.pid}&out_trade_no=x&money=1.00&trade_status=TRADE_SUCCESS&sign=deadbeef`,
    );
    check("伪造易支付回调被拒绝", forged.status === 401, `status=${forged.status}`);
  } else if (MODE === "payjs") {
    const forged = await fetch(`${BASE}/api/pay/notify/payjs`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        return_code: "1",
        out_trade_no: "x",
        total_fee: "1",
        sign: "DEADBEEF",
      }).toString(),
    });
    check("伪造 PayJS 回调被拒绝", forged.status === 401, `status=${forged.status}`);
  } else {
    const forged = await fetch(`${BASE}/api/pay/notify/xunhu`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        trade_order_id: "x",
        total_fee: "0.01",
        status: "OD",
        appid: CONFIG.appid,
        hash: "deadbeef",
      }).toString(),
    });
    check("伪造虎皮椒回调被拒绝", forged.status === 401, `status=${forged.status}`);
  }
} finally {
  await new Promise((resolve) => server.close(resolve));
}

const failed = results.filter((item) => !item.pass);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
if (failed.length > 0) {
  console.error("FAILED:", failed.map((item) => item.name).join(" | "));
  process.exit(1);
}

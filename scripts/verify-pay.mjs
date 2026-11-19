/**
 * 会员支付接口与导出水印验收（mock 通道，不访问微信）。
 *
 * 启动应用前：
 *   PAY_ENABLED=true PAY_PROVIDER=mock
 * 并从项目根目录运行：
 *   node scripts/verify-pay.mjs
 *
 * 可选：
 *   APP_URL=http://127.0.0.1:3000
 *   EXPORT_CDP_URL=http://127.0.0.1:9227   # 导出水印用例需要无头浏览器
 *   EXPECT_PAY_DISABLED=1                  # 验证 PAY_ENABLED=false 的旧行为
 */
import { PDFDocument } from "pdf-lib";

const BASE = (process.env.APP_URL ?? "http://127.0.0.1:3000").replace(/\/$/, "");
const DISABLED_MODE = process.env.EXPECT_PAY_DISABLED === "1";

const results = [];
const check = (name, pass, detail = "") => {
  results.push({ name, pass, detail });
  console.log(`${pass ? "PASS" : "FAIL"} ${name}${detail ? ` — ${detail}` : ""}`);
};
const skip = (name, detail = "") => {
  results.push({ name, pass: true, skipped: true, detail });
  console.log(`SKIP ${name}${detail ? ` — ${detail}` : ""}`);
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

async function raw(path, options = {}) {
  return fetch(`${BASE}${path}`, { ...options, signal: AbortSignal.timeout(90000) });
}

function pngSize(buffer) {
  const view = new DataView(buffer);
  return { width: view.getUint32(16), height: view.getUint32(20) };
}

const planResponse = await call("/api/pay/plans");
const plans = planResponse.json.plans ?? [];
const month = plans.find((item) => item.id === "month");
const year = plans.find((item) => item.id === "year");

if (DISABLED_MODE) {
  check(
    "PAY_ENABLED=false：支付接口关闭",
    planResponse.json.enabled === false && planResponse.json.payEnabled === false,
    `enabled=${planResponse.json.enabled}, payEnabled=${planResponse.json.payEnabled}`,
  );

  const disabledEmail = `payOff${randomDigits(8)}@qq.com`;
  const disabledUser = await call("/api/auth/register", {
    method: "POST",
    body: { account: disabledEmail, password: "PayVerify123" },
  });
  const disabledOrder = await call("/api/pay/orders", {
    method: "POST",
    cookie: disabledUser.cookie,
    body: { plan: "month" },
  });
  check(
    "PAY_ENABLED=false：已登录下单返回 503",
    disabledOrder.status === 503,
    `status=${disabledOrder.status}`,
  );

  const exportResponse = await raw("/api/export-image", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ doc: await sampleDoc() }),
  });
  check(
    "PAY_ENABLED=false：匿名导出无水印",
    exportResponse.ok
      ? exportResponse.headers.get("X-Watermark") === "0"
      : exportResponse.status === 503,
    `status=${exportResponse.status}, X-Watermark=${exportResponse.headers.get("X-Watermark")}`,
  );

  finish();
} else {
  check(
    "支付配置为 mock 且已开启",
    planResponse.json.enabled === true && planResponse.json.provider === "mock",
    `enabled=${planResponse.json.enabled}, provider=${planResponse.json.provider}`,
  );
  check(
    "月卡/年卡金额与时长正确",
    month?.amountFen === 990 &&
      month?.days === 30 &&
      year?.amountFen === 6800 &&
      year?.days === 365,
    `month=${month?.amountFen}/${month?.days}, year=${year?.amountFen}/${year?.days}`,
  );
  check(
    "计划接口返回微信与支付宝通道",
    (planResponse.json.channels ?? []).some((item) => item.id === "wechat") &&
      (planResponse.json.channels ?? []).some((item) => item.id === "alipay"),
    (planResponse.json.channels ?? []).map((item) => item.id).join(","),
  );

  const anonymous = await call("/api/pay/orders", {
    method: "POST",
    body: { plan: "month" },
  });
  check("未登录下单返回 401", anonymous.status === 401, `status=${anonymous.status}`);

  const emailA = `payA${randomDigits(8)}@qq.com`;
  const registeredA = await call("/api/auth/register", {
    method: "POST",
    body: { account: emailA, password: "PayVerify123" },
  });
  const cookieA = registeredA.cookie;
  check(
    "注册验收账号 A",
    registeredA.status === 200 && Boolean(cookieA),
    `status=${registeredA.status}`,
  );

  const invalidPlan = await call("/api/pay/orders", {
    method: "POST",
    cookie: cookieA,
    body: { plan: "lifetime" },
  });
  check("非法档位返回 400", invalidPlan.status === 400, `status=${invalidPlan.status}`);

  const firstOrder = await call("/api/pay/orders", {
    method: "POST",
    cookie: cookieA,
    body: { plan: "month" },
  });
  const orderA = firstOrder.json.order;
  check(
    "月卡下单成功（990 分 / pending / codeUrl）",
    firstOrder.status === 200 &&
      orderA?.amountFen === 990 &&
      orderA?.status === "pending" &&
      typeof orderA?.codeUrl === "string" &&
      orderA.codeUrl.startsWith("mock://"),
    `status=${firstOrder.status}, amount=${orderA?.amountFen}, orderStatus=${orderA?.status}`,
  );

  const reuseOrder = await call("/api/pay/orders", {
    method: "POST",
    cookie: cookieA,
    body: { plan: "month" },
  });
  check(
    "重复下单复用未支付订单",
    reuseOrder.status === 200 && reuseOrder.json.order?.id === orderA?.id,
    `first=${orderA?.id?.slice(0, 8)}, second=${reuseOrder.json.order?.id?.slice(0, 8)}`,
  );

  const mockPaid = await call(`/api/pay/orders/${orderA?.id}/mock-pay`, {
    method: "POST",
    cookie: cookieA,
  });
  const expiry1 = mockPaid.json.membership?.expiresAt
    ? new Date(mockPaid.json.membership.expiresAt).getTime()
    : 0;
  const days1 = (expiry1 - Date.now()) / 86400000;
  check(
    "mock 支付开通 30 天会员",
    mockPaid.status === 200 &&
      mockPaid.json.membership?.active === true &&
      days1 > 29.9 &&
      days1 < 30.1,
    `status=${mockPaid.status}, active=${mockPaid.json.membership?.active}, days=${days1.toFixed(2)}`,
  );

  const repeatPaid = await call(`/api/pay/orders/${orderA?.id}/mock-pay`, {
    method: "POST",
    cookie: cookieA,
  });
  const expiry2 = repeatPaid.json.membership?.expiresAt
    ? new Date(repeatPaid.json.membership.expiresAt).getTime()
    : 0;
  check(
    "同一订单重复支付不重复加时长",
    repeatPaid.status === 200 && Math.abs(expiry2 - expiry1) < 2000,
    `first=${new Date(expiry1).toISOString()}, second=${new Date(expiry2).toISOString()}`,
  );

  const yearOrder = await call("/api/pay/orders", {
    method: "POST",
    cookie: cookieA,
    body: { plan: "year" },
  });
  const yearPaid = await call(`/api/pay/orders/${yearOrder.json.order?.id}/mock-pay`, {
    method: "POST",
    cookie: cookieA,
  });
  const expiry3 = yearPaid.json.membership?.expiresAt
    ? new Date(yearPaid.json.membership.expiresAt).getTime()
    : 0;
  const days3 = (expiry3 - expiry1) / 86400000;
  check(
    "年卡时长从当前到期日叠加 365 天",
    yearPaid.status === 200 && days3 > 364.9 && days3 < 365.1,
    `addedDays=${days3.toFixed(2)}`,
  );

  const alipayOrder = await call("/api/pay/orders", {
    method: "POST",
    cookie: cookieA,
    body: { plan: "month", channel: "alipay" },
  });
  const alipayPaid = await call(
    `/api/pay/orders/${alipayOrder.json.order?.id}/mock-pay`,
    { method: "POST", cookie: cookieA },
  );
  check(
    "支付宝通道下单并可支付",
    alipayOrder.status === 200 &&
      alipayOrder.json.order?.channel === "alipay" &&
      String(alipayOrder.json.order?.codeUrl).includes("channel=alipay") &&
      alipayPaid.status === 200 &&
      alipayPaid.json.membership?.active === true,
    `channel=${alipayOrder.json.order?.channel}, codeUrl=${alipayOrder.json.order?.codeUrl}, paid=${alipayPaid.status}`,
  );

  const emailB = `payB${randomDigits(8)}@qq.com`;
  const registeredB = await call("/api/auth/register", {
    method: "POST",
    body: { account: emailB, password: "PayVerify123" },
  });
  const cookieB = registeredB.cookie;
  const foreignOrder = await call(`/api/pay/orders/${orderA?.id}`, {
    cookie: cookieB,
  });
  check(
    "用户 B 查询用户 A 的订单返回 404",
    foreignOrder.status === 404,
    `status=${foreignOrder.status}`,
  );

  const missingOrder = await call(
    "/api/pay/orders/00000000-0000-0000-0000-000000000000/mock-pay",
    { method: "POST", cookie: cookieA },
  );
  check("不存在的订单不支持 mock 支付", missingOrder.status === 404, `status=${missingOrder.status}`);

  const callbackInMock = await call("/api/pay/notify/wechat", {
    method: "POST",
    body: {},
  });
  check(
    "mock 模式下微信回调路由不存在",
    callbackInMock.status === 404,
    `status=${callbackInMock.status}`,
  );

  const doc = await sampleDoc();

  const anonymousExport = await raw("/api/export-image", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ doc }),
  });
  check(
    "匿名导出被拒绝（403 仅会员）",
    anonymousExport.status === 403,
    `status=${anonymousExport.status}`,
  );

  const nonMemberExport = await raw("/api/export-image", {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: cookieB },
    body: JSON.stringify({ doc }),
  });
  check(
    "未付费登录用户导出被拒绝（403）",
    nonMemberExport.status === 403,
    `status=${nonMemberExport.status}`,
  );

  const anonymousPdf = await raw("/api/export-pdf", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ doc }),
  });
  check(
    "匿名文字版 PDF 被拒绝（403）",
    anonymousPdf.status === 403,
    `status=${anonymousPdf.status}`,
  );

  const memberExport = await raw("/api/export-image", {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: cookieA },
    body: JSON.stringify({ doc }),
  });
  if (memberExport.status === 503) {
    skip("会员导出无水印", "未连接无头浏览器（EXPORT_CDP_URL）");
  } else {
    const memberBuffer = await memberExport.arrayBuffer();
    const memberSize = pngSize(memberBuffer);
    check(
      "会员导出无水印且为单页 A4",
      memberExport.ok &&
        memberExport.headers.get("X-Watermark") === "0" &&
        memberSize.width === 1588,
      `status=${memberExport.status}, X-Watermark=${memberExport.headers.get("X-Watermark")}, size=${memberSize.width}x${memberSize.height}`,
    );
  }

  const memberPdf = await raw("/api/export-pdf", {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: cookieA },
    body: JSON.stringify({ doc }),
  });
  if (memberPdf.status === 503) {
    skip("会员文字版 PDF 无水印", "未连接无头浏览器（EXPORT_CDP_URL）");
  } else {
    const memberPdfBytes = await memberPdf.arrayBuffer();
    const memberPdfDoc = await PDFDocument.load(memberPdfBytes);
    check(
      "会员文字版 PDF 无水印",
      memberPdf.ok &&
        memberPdf.headers.get("X-Watermark") === "0" &&
        memberPdfDoc.getPageCount() >= 1,
      `status=${memberPdf.status}, X-Watermark=${memberPdf.headers.get("X-Watermark")}, pages=${memberPdfDoc.getPageCount()}`,
    );
  }

  finish();
}

async function sampleDoc() {
  const token = "-0Jcctw";
  return {
    schemaVersion: 1,
    id: "verify-pay-sample",
    title: "支付验收简历",
    templateId: `wcx-${token}`,
    templatePreset: {
      id: `wcx-${token}`,
      name: "支付验收模板",
      desc: "",
      layout: "single",
      source: { token, name: "支付验收模板" },
    },
    theme: { primary: "", fontScale: "md", lineHeight: 1.2, margin: 10 },
    basics: {
      name: "支付验收",
      jobTitle: "测试工程师",
      phone: "18800000000",
      email: "verify@example.com",
      city: "成都",
      links: [],
    },
    sections: [
      {
        id: "verify-summary",
        type: "summary",
        title: "个人简介",
        visible: true,
        content: "用于验证免费版与会员导出水印差异。",
      },
    ],
    updatedAt: Date.now(),
  };
}

function finish() {
  const failed = results.filter((item) => !item.pass);
  const skipped = results.filter((item) => item.skipped);
  console.log(
    `\n${results.length - failed.length - skipped.length}/${results.length - skipped.length} passed` +
      (skipped.length ? `, ${skipped.length} skipped` : ""),
  );
  if (failed.length > 0) {
    console.error("FAILED:", failed.map((item) => item.name).join(" | "));
    process.exit(1);
  }
}

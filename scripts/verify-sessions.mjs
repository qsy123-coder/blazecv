/**
 * 登录设备（会话）管理的接口级验证：
 * 注册/登录产生多会话 → 列表 → 退出其他设备 → 单个会话退出。
 *
 * 用法：node scripts/verify-sessions.mjs
 * 环境变量：APP_URL（默认 http://127.0.0.1:3000）。
 */
const BASE = (process.env.APP_URL ?? "http://127.0.0.1:3000").replace(/\/$/, "");
const UA_A = "VerifyA/1.0 (Windows NT 10.0; Win64; x64)";
const UA_B = "VerifyB/1.0 (Macintosh; Intel Mac OS X 10_15_7)";

const results = [];
const check = (name, pass, detail = "") => {
  results.push({ name, pass, detail });
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

async function call(path, { method = "GET", body, cookie, userAgent } = {}) {
  const response = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      ...(body ? { "Content-Type": "application/json" } : {}),
      ...(cookie ? { Cookie: cookie } : {}),
      ...(userAgent ? { "User-Agent": userAgent } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await response.json().catch(() => ({}));
  return { status: response.status, json, cookie: sessionCookie(response) };
}

const email = `sessions${randomDigits(8)}@qq.com`;
const password = "SessionPass123";

const registered = await call("/api/auth/register", {
  method: "POST",
  body: { account: email, password },
  userAgent: UA_A,
});
check(
  "注册并建立会话 A",
  registered.status === 200 && Boolean(registered.cookie),
  `${registered.status} cookie=${Boolean(registered.cookie)}`,
);
const cookieA = registered.cookie;

const loggedIn = await call("/api/auth/login", {
  method: "POST",
  body: { account: email, password },
  userAgent: UA_B,
});
check(
  "同账号在另一设备登录（会话 B）",
  loggedIn.status === 200 && Boolean(loggedIn.cookie),
  `${loggedIn.status} cookie=${Boolean(loggedIn.cookie)}`,
);
const cookieB = loggedIn.cookie;

const listed = await call("/api/auth/sessions", { cookie: cookieA });
const sessions = listed.json.sessions ?? [];
check(
  "会话列表返回 2 台设备",
  listed.status === 200 && sessions.length === 2,
  `status=${listed.status}, count=${sessions.length}`,
);
check(
  "列表包含当前标记与设备信息",
  sessions.filter((item) => item.current).length === 1 &&
    sessions.some((item) => item.userAgent === UA_A) &&
    sessions.some((item) => item.userAgent === UA_B),
  sessions.map((item) => `${item.current ? "*" : ""}${item.userAgent}`).join(" | "),
);

const revoked = await call("/api/auth/sessions/revoke-others", {
  method: "POST",
  cookie: cookieA,
});
check(
  "退出其他设备",
  revoked.status === 200 && revoked.json.revoked === 1,
  `status=${revoked.status}, revoked=${revoked.json.revoked}`,
);

const meB = await call("/api/auth/me", { cookie: cookieB });
const meA = await call("/api/auth/me", { cookie: cookieA });
check(
  "被退出的会话 B 已失效",
  meB.status === 200 && meB.json.user === null,
  `user=${meB.json.user === null ? "null" : meB.json.user?.email}`,
);
check(
  "当前会话 A 仍有效",
  meA.status === 200 && meA.json.user?.email === email,
  `user=${meA.json.user?.email ?? "null"}`,
);

const remaining = await call("/api/auth/sessions", { cookie: cookieA });
check(
  "会话列表只剩当前设备",
  (remaining.json.sessions ?? []).length === 1 &&
    remaining.json.sessions?.[0]?.current === true,
  `count=${(remaining.json.sessions ?? []).length}`,
);

const currentId = remaining.json.sessions?.[0]?.id ?? "";
const selfRevoke = await call(`/api/auth/sessions/${currentId}`, {
  method: "DELETE",
  cookie: cookieA,
});
check(
  "退出当前会话",
  selfRevoke.status === 200 && selfRevoke.json.current === true,
  `status=${selfRevoke.status}, current=${selfRevoke.json.current}`,
);

const meAfter = await call("/api/auth/me", { cookie: cookieA });
check(
  "退出当前会话后登录态失效",
  meAfter.status === 200 && meAfter.json.user === null,
  `user=${meAfter.json.user === null ? "null" : "still"}`,
);

const anonymous = await call("/api/auth/sessions");
check("未登录访问会话列表被拒绝", anonymous.status === 401, `status=${anonymous.status}`);

const failed = results.filter((item) => !item.pass);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length === 0 ? 0 : 1);

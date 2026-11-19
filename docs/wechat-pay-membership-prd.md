# 微信支付会员 PRD

> 状态：M1 已实现；直连、服务商（partner）、Ping++（微信 + 支付宝）三种通道代码就绪
> 本地验收：mock 19/19、会员 UI 12/12、partner 假网关 8/8、Ping++ 假网关 13/13；待真实商户参数联调
> 关联：`docs/account-sync-prd.md`、`docs/roadmap.md`　｜　决策日期：2026-11-18

## 1. 背景与问题

BlazeCV 目前是「免登录 + 免费导出」定位：全站文案、FAQ、模板页、SEO 描述都写着
「免费导出 PDF / PNG / Word」「不需要注册账号」。代码里没有任何支付、订单、权益相关实现，
`docs/roadmap.md` 的「商业化」只是规划条目。

现在要接入**真实微信支付**，卖**会员订阅**，但商户侧只有个体工商户营业执照，微信支付商户号尚未申请。
因此本期必须同时解决三件事：

1. 按微信支付 APIv3（Native 扫码）实现真实下单与回调，配置项全部用环境变量占位；
2. 提供 `mock` 支付通道，让「下单 → 支付 → 回调 → 开通会员 → 去水印导出」在本地可完整验收；
3. 把「免费导出」的既有产品口径改成「免费编辑/预览/带水印导出，会员无水印导出」，
   并保证现有 47 项回归与 28 项验收不被水印破坏。

### 1.1 现状盘点（代码事实）

| 模块 | 现状 | 对本期的影响 |
|---|---|---|
| 账号 | `users` / `sessions`，手机号验证码、邮箱密码、会话 30 天（`src/lib/server/auth.ts`） | 直接复用，不新建账号体系 |
| 数据库 | PGlite 文件库或 PostgreSQL，schema 内联在 `src/lib/server/db.ts` 的 `SCHEMA` | 新增表必须同时改 `db.ts` 与 `infra/db/migrations/0001_init.sql` |
| 导出 | `src/app/api/export-image`、`src/app/api/export-pdf` 服务端渲染；`src/lib/exact-export.ts` 另有 html-to-image / 前端 Word 回退 | 水印只在服务端渲染路径强制；前端回退路径只能尽力 |
| 登录状态 | `getCurrentUser()` 读 Cookie | 导出时可直接判定会员 |
| 回归 | `verify.mjs` 47 项、`acceptance.mjs` 28 项默认以「导出无额外内容」为基准 | 必须用 `PAY_ENABLED` 开关隔离，否则全挂 |

## 2. 目标 / 非目标

### 2.1 目标

- 会员档位：**月卡 ¥9.90（990 分，30 天）**、**年卡 ¥68.00（6800 分，365 天）**。
- **不做自动续费**：到期即失效，用户手动续费；续费时长从「当前到期时间」向后叠加。
- 支付方式：**PC 网页 Native 扫码**（微信扫二维码完成支付）。
- 权益：**仅无水印导出**。免费用户仍可编辑、预览、导出，但导出文件带水印。
- 未登录用户可以继续编辑/预览/带水印导出；**登录且会员有效**才无水印。
- 下单、二维码展示、状态轮询、回调验签解密、掉单补偿、幂等、人工退款全部落地。
- `PAY_PROVIDER=mock` 时本地可完整验收；`PAY_PROVIDER=wechat` 时走真实 APIv3。
- 商户资质、网站主体信息、客服与退款规则在页面上可查。

### 2.2 非目标（本期明确不做）

- 自动续费 / 周期扣款、签约代扣。
- 优惠券、邀请返利、分销、拼团。
- 自助退款页、发票系统（先人工客服处理）。
- H5 支付、JSAPI、小程序支付（本期只做 Native 扫码）。
- Pro 模板专区、云端额度、版本历史收费（权益只有“去水印”）。
- DRM 级防绕过：纯前端生成的 Word 文字版、JSON、浏览器打印无法强约束，本期接受该边界。

## 3. 用户故事

| # | 故事 | 验收信号 |
|---|---|---|
| P1 | 我是免费用户，想先导出看看效果 | 不登录也能导出，文件带可见水印，页面提示「开通会员去水印」 |
| P2 | 我决定买月卡，用电脑打开网站 | 点「开通会员」→ 若未登录先登录 → 选择月卡 → 出现微信二维码 → 手机扫码支付 |
| P3 | 我支付完成后回到网页 | 5 秒内页面显示「已开通」，导出立即无水印，会员中心显示到期日 |
| P4 | 我上次买的还没到期，又想买年卡 | 到期日从原到期日继续叠加，不覆盖、不缩短 |
| P5 | 我付了钱但页面断了 | 重新打开会员中心/订单，服务端查单补偿，仍能显示已支付并开通 |
| P6 | 我想退款 | 页面写明退款规则与客服方式；后台用脚本按订单号原路退款 |
| P7 | 我担心被骗 | 页面展示经营主体、客服、退款规则；支付二维码来自微信官方 `code_url` |

## 4. 方案设计

### 4.1 会员与订单模型

**订单是唯一事实来源，会员表是投影。**

- `payment_orders` 记录每一次下单、金额、状态、微信侧流水号；
- `memberships` 只存 `user_id / plan / expires_at`，供导出接口快速判定；
- `membership_grants` 记录「哪一笔订单给这个用户加了多少天」，用 `order_id` 唯一约束保证
  **同一订单只发货一次**；
- `payment_events` 存回调原文摘要，用于排障与去重审计。

为什么不直接在 `users` 加 `is_vip` / `vip_expires_at`：
权益会扩展到模板、云端额度，订单需要退款与对账，独立表才能在不改账号逻辑的前提下演进。
为什么不做「按订单实时计算到期时间」：叠加规则涉及先后顺序与退款，物化一个 `expires_at`
更简单，且导出接口只需要一次主键查询。

**时长叠加规则**：`expires_at = GREATEST(当前 expires_at, now()) + plan.days`。
例：剩余 10 天时买月卡 → 40 天；已过期时买月卡 → 30 天。

### 4.2 支付通道抽象

```
PAY_ENABLED=false            # 默认关闭：导出无水印，支付接口 503
PAY_PROVIDER=mock|wechat     # 开启后必填
```

`src/lib/server/payments/provider.ts` 定义统一接口：

```ts
interface PayProvider {
  id: "mock" | "wechat";
  createNativeOrder(input: {
    outTradeNo: string;
    description: string;
    amountFen: number;
    expiresAt: Date;
    attach?: string;
  }): Promise<{ codeUrl: string; providerTradeNo?: string }>;
  queryOrder(outTradeNo: string): Promise<{
    state: "pending" | "paid" | "closed" | "unknown";
    providerTradeNo?: string;
    amountFen?: number;
  }>;
  closeOrder(outTradeNo: string): Promise<void>;
  refund(input: {
    outTradeNo: string;
    outRefundNo: string;
    refundFen: number;
    totalFen: number;
    reason: string;
  }): Promise<{ refundId: string; state: string }>;
}
```

- `wechat.ts`：直接调微信支付 APIv3，不引入第三方 SDK（用 Node `crypto` 签名验签，依赖最少、行为可控）。
- `mock.ts`：不访问外网；`codeUrl` 返回站内模拟地址，提供 `mock-pay` 接口走与真实回调**同一条发货函数**。

`PAY_ENABLED=false` 时：
- 导出接口一律按会员处理（不加水印）；
- `/api/pay/*` 返回 `503 {error:"支付未开启"}`；
- `/membership` 显示「即将上线」，不展示二维码。

### 4.3 微信支付 APIv3 Native 流程

**下单**：`POST https://api.mch.weixin.qq.com/v3/pay/transactions/native`

```json
{
  "appid": "<WECHAT_PAY_APPID>",
  "mchid": "<WECHAT_PAY_MCHID>",
  "description": "BlazeCV 会员月卡",
  "out_trade_no": "BC20261118153000A1B2C3",
  "notify_url": "https://aetouban.cn/api/pay/notify/wechat",
  "time_expire": "2026-11-18T15:45:00+08:00",
  "amount": { "total": 990, "currency": "CNY" },
  "attach": "month"
}
```

- 请求头 `Authorization: WECHATPAY2-SHA256-RSA2048 mchid="...",nonce_str="...",signature="...",timestamp="...",serial_no="..."`；
- 待签名串：`POST\n/v3/pay/transactions/native\n<timestamp>\n<nonce>\n<body>\n`，商户私钥 RSA-SHA256；
- 返回 `{ "code_url": "weixin://wxpay/bizpayurl?pr=..." }`，前端用 `qrcode` 渲染成二维码；
- `out_trade_no` 规则：`BC` + `yyyyMMddHHmmss` + 6 位大写字母数字，总长 ≤ 32，字符集 `[A-Za-z0-9_-]`。

**回调**：`POST /api/pay/notify/wechat`

1. 读取**原始请求体文本**（先 `await request.text()`，再 `JSON.parse`，否则验签必失败）；
2. 用 `Wechatpay-Timestamp / Wechatpay-Nonce / Wechatpay-Signature / Wechatpay-Serial` 验签：
   待验串 `timestamp\nnonce\nbody\n`，用微信支付公钥（或平台证书）验 RSA-SHA256；
3. 用 APIv3 密钥 AES-256-GCM 解密 `resource`：
   `ciphertext` base64、`nonce`、`associated_data`；
4. 校验 `mchid`、`appid`、`out_trade_no` 存在、`amount.total` 与订单一致、`trade_state=SUCCESS`；
5. 调 `applyPaidOrder()` 幂等发货；
6. 返回 `200 {"code":"SUCCESS","message":"成功"}`；内部临时错误返回 500 让微信重试。

**查单补偿**：`GET /v3/pay/transactions/out-trade-no/{out_trade_no}?mchid=`。
前端轮询 `GET /api/pay/orders/:id` 时，若订单 `pending` 且距上次查单 > 10 秒、创建 > 30 秒，
服务端主动查一次微信；`SUCCESS` 则走同一发货函数。用于回调丢失、内网抖动。

**关单**：`POST /v3/pay/transactions/out-trade-no/{out_trade_no}/close`。订单超过 15 分钟未支付时，
由懒清理或退款脚本关闭；用户可重新下单，不复用旧单。

**退款**：`POST /v3/refund/domestic/refunds`，`out_refund_no` 唯一，金额为分，原路退回。
本期由 `scripts/refund-pay.mjs <out_trade_no> [金额分]` 人工触发，退款成功后把订单置 `refunded`，
并按退款金额扣减会员时长（整单退款则回滚对应 grant 天数；部分退款本期只记录、不扣时长）。

**证书/公钥模式**：优先用「微信支付公钥」模式（商户平台下载公钥，配置公钥 ID），
回调头 `Wechatpay-Serial` 校验公钥 ID；若商户平台仍发放平台证书，则实现
`GET /v3/certificates` 下载 + 内存缓存 + 到期轮换，作为兼容分支。

### 4.3.1 服务商模式（partner）

本项目同一套代码支持直连与 **服务商（ISV）模式**，用环境变量切换：

```ini
WECHAT_PAY_MODE=partner
WECHAT_PAY_SP_APPID=服务商 AppID
WECHAT_PAY_SP_MCHID=服务商商户号
WECHAT_PAY_SUB_MCHID=特约商户号（你的个体户）
WECHAT_PAY_SUB_APPID=可选，子商户 AppID
```

与直连模式的差异：

| 项 | 直连 | 服务商 |
|---|---|---|
| Native 下单 | `POST /v3/pay/transactions/native` | `POST /v3/pay/partner/transactions/native` |
| 下单字段 | `appid` / `mchid` | `sp_appid` / `sp_mchid` / `sub_mchid`（`sub_appid` 可选） |
| 查单 | `?mchid=` | `?sp_mchid=&sub_mchid=` |
| 关单 | body `{mchid}` | body `{sp_mchid, sub_mchid}` |
| 退款 | body 无 sub_mchid | body 带 `sub_mchid` |
| 回调校验 | `mchid` / `appid` | `sp_mchid` / `sub_mchid` / `sp_appid` / `sub_appid` |
| AppID 来源 | 自己的公众号/小程序（通常需 300 元/年认证） | 服务商的 AppID，不需要自己认证 |
| 资金 | 结算到自己的商户号 | 结算到特约商户号；服务商可能另收服务费 |
| 费率 | 签约费率 | 与服务商协商，通常不低于直连 |

实现要点：

- `wechatMissingConfig()` 按 `WECHAT_PAY_MODE` 校验不同必填项；
- 订单表新增 `sub_mchid` 字段，下单时记录，便于对账；
- 回调签名仍用**服务商**的 APIv3 密钥/证书/公钥验签解密；
- `WECHAT_PAY_API_BASE` 仅用于本地假网关联调，生产不设置。

服务商侧前置条件：

1. 找到一家已开通「普通服务商」能力的机构（银行、持牌支付机构或微信支付服务商）；
2. 让服务商通过「特约商户进件」把你的个体工商户录为子商户，审核通过后拿到 **`sub_mchid`**；
3. 确认服务商给你的子商户号已开通 **Native 支付**，并绑定服务商 AppID；
4. 从服务商处拿：`sp_appid`、`sp_mchid`、`sub_mchid`、APIv3 密钥、服务商 API 证书序列号与私钥、微信支付公钥/平台证书；
5. 回调地址仍填 `https://aetouban.cn/api/pay/notify/wechat`。

注意：服务商模式省掉的是「自己注册并认证公众号」的 300 元/年，不是支付手续费；
服务商可能按笔或按月收取通道服务费，签约前问清费率、结算周期、退款责任和进件材料。

### 4.3.2 Ping++ 聚合支付（pingpp）

`PAY_PROVIDER=pingpp` 时使用 Ping++ 的 Charge API，由 Ping++ 负责微信商户进件与渠道对接。
本项目的适配器：

| 能力 | Ping++ 实现 |
|---|---|
| 下单 | `POST https://api.pingxx.com/v1/charges`，微信 `channel=wx_pub_qr`、支付宝 `channel=alipay_qr`，金额单位为分 |
| 二维码 | 从响应 `credential.wx_pub_qr` / `credential.alipay_qr` 取二维码链接 |
| 查单 | `GET /v1/charges/{charge_id}`，`paid=true` 即成功 |
| 关单 | Ping++ 无关闭接口，依赖 `time_expire` |
| 退款 | `POST /v1/charges/{charge_id}/refunds` |
| 请求签名 | `RSA-SHA256(body + path + timestamp)`，`Pingplusplus-Signature` / `Pingplusplus-Request-Timestamp` |
| 回调 | `POST /api/pay/notify/pingpp`，用 Ping++ 公钥验 `x-pingplusplus-signature` |

环境变量：

```ini
PAY_PROVIDER=pingpp
PINGPP_API_KEY=sk_live_...
PINGPP_APP_ID=app_...
PINGPP_WECHAT_CHANNEL=wx_pub_qr
PINGPP_ALIPAY_CHANNEL=alipay_qr
PINGPP_WECHAT_ENABLED=false   # 先只接支付宝时设 false
PINGPP_ALIPAY_ENABLED=true    # Ping++ 未开通支付宝时设 false
PINGPP_SUB_MCH_ID=            # 仅 Ping++ 子商户层级需要
PINGPP_PRIVATE_KEY_PATH=      # 商户 RSA 私钥（本地生成）
PINGPP_PRIVATE_KEY_BASE64=
PINGPP_PUBLIC_KEY_PATH=       # Ping++ 公钥（Dashboard -> 开发信息）
PINGPP_PUBLIC_KEY_BASE64=
```

会员页会展示「微信支付 / 支付宝」切换；订单表 `payment_orders.channel` 记录用户选择，
同一档位的微信与支付宝订单不会互相复用。直连/服务商微信模式只返回微信通道，
支付宝通过 Ping++ 的 `alipay_qr` 提供。先只接支付宝时设
`PINGPP_WECHAT_ENABLED=false`、`PINGPP_ALIPAY_ENABLED=true`，页面只显示支付宝；
Ping++ 未开通支付宝时反过来隐藏支付宝。

Ping++ 侧需要：

1. 注册 Ping++ 商户并提交个体工商户资料；
2. 创建应用，拿到 `app_id` 与 API Key；
3. 本地生成 RSA 密钥对，把**公钥**上传到 Ping++ Dashboard「商户 RSA 公钥」；
4. 在 Dashboard 配置 Webhook：`https://aetouban.cn/api/pay/notify/pingpp`，事件选 `charge.succeeded`；
5. 确认 `wx_pub_qr` 渠道已开通，并确认结算主体/费率。

注意：Ping++ 是聚合技术服务商，资金由渠道/Ping++ 合作机构清算；签约前确认结算到你的账户、
费率与退款责任。它给的是 Ping++ API（B 类），不是微信 partner 直连。

### 4.4 水印与权益判定

**判定位置**：服务端导出接口，不信任前端。

```ts
const user = await getCurrentUser();
const member = user ? await membershipActive(user.id) : false;
const watermark = !member;
```

- `POST /api/export-image`、`POST /api/export-pdf` 在截图/打印前，向 iframe 注入水印层；
- 响应头增加 `X-Watermark: 1|0`，前端据此提示「已带水印，开通会员可去除」；
- 水印层要求：
  - `position:absolute; inset:0; pointer-events:none; z-index:2147483647;`
  - 高度覆盖整份自然高度，用 `background-repeat:repeat` 的 SVG 平铺，保证**每一页切片**都有水印；
  - 文字如 `BlazeCV 免费版 · 开通会员去水印`，旋转 -30°，透明度 0.08～0.12；
  - `print-color-adjust: exact`，PDF 打印时必须保留；
  - 不参与布局（绝对定位），不改变页面尺寸与分页，避免破坏 A4 切片。
- **客户端回退路径**（无 exact token 的经典模板、html-to-image PNG、`window.print()`）：
  前端拿到 `/api/membership` 状态后，在导出节点上叠加同款水印；打印用 `@media print` 层。
  这是尽力而为，明确写进已知边界。

**为什么不用 sharp 后处理图片**：PDF 文字版是原生打印，后处理会丢文字可选中特性；
在 HTML 层注入对 PNG/PDF/Word 图片版三条路径统一，且不增加运行时依赖。

### 4.5 前端交互

- 新增 `/membership` 会员中心：当前状态、月卡/年卡卡片、支付二维码弹窗、退款与客服说明。
- 编辑器顶栏 `Toolbar`：
  - 导出菜单每项在非会员时显示小标签「水印」；
  - 导出完成后若 `X-Watermark=1`，toast 提示并给「开通会员」按钮；
  - `CloudMenu` 增加「会员中心」入口，已登录显示到期日。
- 未登录点「开通会员」：触发 `window.dispatchEvent(new CustomEvent("blazecv:open-login"))`，
  `CloudMenu` 监听并打开登录面板；登录成功后回到会员中心继续下单。
- 支付弹窗：
  - 展示二维码（`qrcode` 生成 data URL）、金额、订单号后 8 位、15 分钟倒计时；
  - 每 2 秒 `GET /api/pay/orders/:id`，`paid` 后展示成功态并刷新会员状态；
  - `expired/closed` 展示「二维码已失效，重新下单」；
  - 关闭弹窗不取消订单，重新打开「待支付订单」可继续展示（复用未过期订单）。
- 支付成功后：`router.refresh()` + 全局会员状态更新，编辑器导出立即无水印。

### 4.6 文案与 SEO 口径

以下位置目前明确写「免费导出 / 不需要注册」，必须同步改为
「免费编辑、A4 预览与带水印导出；会员可无水印导出 PDF / PNG / Word」：

- `src/app/page.tsx`
- `src/app/faq/page.tsx`（“模板是否免费 / 如何导出”两条答案）
- `src/app/manifest.ts`
- `src/app/editor/page.tsx`
- `src/app/templates/[token]/page.tsx`
- `src/app/templates/layout/[layout]/page.tsx`
- `src/components/templates/TemplateCollectionPage.tsx`
- `src/components/home/HomePage.tsx`
- `src/components/guides/GuideArticle.tsx`
- `src/lib/seo-collections.ts`
- `docs/roadmap.md`（商业化条目从规划改为进行中）

底线：不能一边收钱一边继续宣称「免费导出不收费」，否则属于虚假宣传，微信支付审核也会看网站内容。

## 5. 数据与接口变更

### 5.1 数据表（增量、可重复执行）

同时写入两处，保持 PGlite 与 PostgreSQL 一致：

1. `src/lib/server/db.ts` 的 `SCHEMA` 字符串；
2. `infra/db/migrations/0001_init.sql` 末尾追加同样语句。

```sql
CREATE TABLE IF NOT EXISTS payment_orders (
  id uuid PRIMARY KEY,
  out_trade_no text UNIQUE NOT NULL,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  plan text NOT NULL,
  amount_fen integer NOT NULL CHECK (amount_fen > 0),
  status text NOT NULL DEFAULT 'created',
  provider text NOT NULL DEFAULT 'wechat',
  code_url text,
  provider_trade_no text,
  attach jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  paid_at timestamptz,
  last_checked_at timestamptz,
  refunded_at timestamptz
);

CREATE INDEX IF NOT EXISTS payment_orders_user_idx
  ON payment_orders (user_id, created_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS payment_orders_provider_trade_no_key
  ON payment_orders (provider_trade_no) WHERE provider_trade_no IS NOT NULL;

CREATE TABLE IF NOT EXISTS memberships (
  user_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  plan text NOT NULL,
  expires_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS membership_grants (
  order_id uuid PRIMARY KEY REFERENCES payment_orders(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  plan text NOT NULL,
  days integer NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS payment_events (
  id text PRIMARY KEY,
  out_trade_no text NOT NULL,
  event_type text NOT NULL,
  payload jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS payment_events_order_idx
  ON payment_events (out_trade_no, created_at DESC);
```

订单状态机：

```
created ──下单成功──> pending ──支付成功──> paid ──整单退款──> refunded
   │                    │
   └──下单失败──> failed └──超时/关单──> expired / closed
```

`membership_grants.order_id` 主键是**发货幂等的核心**：同一订单第二次回调只会
`ON CONFLICT DO NOTHING`，不会重复加时长。

### 5.2 事务与并发

`src/lib/server/db.ts` 目前只有 `query` / `exec`，没有事务封装。本期新增：

```ts
interface Database {
  query<T>(sql: string, params?: unknown[]): Promise<{ rows: T[] }>;
  exec(sql: string): Promise<void>;
  transaction<T>(fn: (tx: Database) => Promise<T>): Promise<T>;
}
```

- PostgreSQL：`pool.connect()` + `BEGIN/COMMIT/ROLLBACK`，用完 `release()`；
- PGlite：单连接文件库，事务期间用进程内互斥锁把其他请求串行化，避免 `BEGIN` 被别的请求插队。

发货流程在事务内完成：
`UPDATE order ... RETURNING` 抢占 → `INSERT grant ON CONFLICT DO NOTHING RETURNING` →
`INSERT memberships ... ON CONFLICT DO UPDATE expires_at = GREATEST(...) + days` →
`INSERT payment_event ON CONFLICT DO NOTHING`。

若发货事务失败：订单仍是 `pending`（或 `paid` 但无 grant），下一次回调/查单/人工脚本可重试，
因为每一步都幂等。

### 5.3 API

| 方法 | 路径 | 鉴权 | 说明 |
|---|---|---|---|
| GET | `/api/membership` | 可选 | 返回 `{active, plan, expiresAt}`；未登录 `active:false` |
| GET | `/api/pay/plans` | 无 | 档位、金额、`provider`（mock/wechat）、`enabled` |
| POST | `/api/pay/orders` | 必须登录 | body `{plan:"month"|"year"}`；创建订单并下单，返回 `{id, codeUrl, amountFen, expiresAt}` |
| GET | `/api/pay/orders/:id` | 必须登录且本人 | 返回状态；必要时触发一次微信查单 |
| POST | `/api/pay/orders/:id/mock-pay` | 必须登录且本人 | 仅 `PAY_PROVIDER=mock` 注册；模拟成功回调 |
| POST | `/api/pay/notify/wechat` | 微信签名 | 回调；不读 Cookie、不做 CSRF |
| POST | `/api/pay/refunds` | `PAY_ADMIN_TOKEN` | 人工退款（M2）；没有该环境变量时 404 |

统一约束：

- 金额只由服务端 `plans.ts` 决定，**客户端不能传金额**；
- 所有响应 `Cache-Control: no-store`；
- 下单限流：每用户 10 次/小时、每 IP 30 次/小时（复用 `checkRateLimit`）；
- 订单查询非本人返回 404，不返回 403，避免枚举；
- `runtime = "nodejs"`（需要 `crypto` 与原始请求体）。

### 5.4 环境变量

`.env.example` 追加（`.env` 不入库）：

```ini
# 支付总开关；false 时导出无水印、支付接口 503
PAY_ENABLED=false
PAY_PROVIDER=wechat   # wechat | pingpp | mock

# 微信支付（Native）
# direct：直连商户；partner：服务商模式
WECHAT_PAY_MODE=direct
WECHAT_PAY_APPID=
WECHAT_PAY_MCHID=

# 服务商模式（MODE=partner 时必填前三项）
WECHAT_PAY_SP_APPID=
WECHAT_PAY_SP_MCHID=
WECHAT_PAY_SUB_MCHID=
WECHAT_PAY_SUB_APPID=

WECHAT_PAY_API_V3_KEY=
WECHAT_PAY_MCH_SERIAL_NO=
# 商户私钥：二选一。生产建议 base64 后放 EnvironmentFile（systemd 不支持多行）
WECHAT_PAY_MCH_PRIVATE_KEY_PATH=
WECHAT_PAY_MCH_PRIVATE_KEY_BASE64=
# 微信支付公钥模式
WECHAT_PAY_PUBLIC_KEY_PATH=
WECHAT_PAY_PUBLIC_KEY_ID=
# 回调地址必须公网 HTTPS
WECHAT_PAY_NOTIFY_URL=https://aetouban.cn/api/pay/notify/wechat

PAY_ORDER_TTL_SECONDS=900
PAY_ADMIN_TOKEN=

# Ping++（PAY_PROVIDER=pingpp）
PINGPP_API_KEY=
PINGPP_APP_ID=
PINGPP_CHANNEL=wx_pub_qr
PINGPP_SUB_MCH_ID=
PINGPP_PRIVATE_KEY_PATH=
PINGPP_PRIVATE_KEY_BASE64=
PINGPP_PUBLIC_KEY_PATH=
PINGPP_PUBLIC_KEY_BASE64=
# Webhook: https://aetouban.cn/api/pay/notify/pingpp
```

启动时校验：`PAY_ENABLED=true` 且 `PAY_PROVIDER=wechat` 时缺任一必需项，
`/api/pay/plans` 返回 `enabled:false` 并在服务端日志给出缺失项名称（不打印值）。

### 5.5 新增依赖

- `qrcode`（+ `@types/qrcode`，devDependency）：把微信 `code_url` 渲染为二维码。
  理由：微信 Native 只给链接，不自带二维码图片；该库纯 JS、无原生依赖，体积可接受。
- 其余用 Node 内置 `crypto`，不引入微信 SDK。

## 6. 边界与异常

| 场景 | 行为 |
|---|---|
| 未登录点开通 | 打开登录面板；登录后回到会员中心，不自动下单 |
| 未登录直接导出 | 允许，带水印；响应头 `X-Watermark: 1` |
| 非会员导出 | 同上 |
| 会员过期当天 | `expires_at <= now()` 即视为过期；导出带水印 |
| 重复点击「立即支付」 | 复用同一 `plan` 的未过期 `pending` 订单，不重复下单；否则新建 |
| 二维码过期（15 分钟） | 状态置 `expired`；前端提示重新下单；旧订单不可支付 |
| 回调重复 | `membership_grants.order_id` 唯一 + 订单状态抢占，只发货一次；仍返回 SUCCESS |
| 回调乱序（先收到 SUCCESS 后收到别的） | 只处理 `trade_state=SUCCESS`；非成功事件记录但不改状态 |
| 回调金额与订单不一致 | 不发货，订单置 `failed`，记录 `payment_events`，日志告警；返回 SUCCESS 停止重试 |
| 回调丢失 | 前端轮询触发服务端查单；查单成功走同一发货函数 |
| 支付成功但页面断网 | 重新打开会员中心，服务端查单恢复；会员实时生效 |
| 用户支付后立刻退款 | `refunded` 订单回滚对应 grant 天数；若已用权益，按规则人工判断 |
| 同一用户并发两笔支付 | 两笔都有效，时长依次叠加；不会互相覆盖 |
| 服务重启 | 所有状态在数据库；PGlite 单实例重启后继续；支付中订单靠查单补偿 |
| 微信侧超时/5xx | 下单失败返回 502，订单置 `failed`，前端提示重试；不暴露微信原始错误中的敏感字段 |
| `PAY_ENABLED=false` | 导出无水印；`/api/pay/*` 503；`/membership` 显示「即将上线」 |
| mock 接口被生产访问 | `PAY_PROVIDER!=mock` 时路由不注册，404 |
| 数据库不可用 | 导出按**非会员**处理（带水印），不回退成无水印；支付接口 500 |

## 7. 安全与合规

### 7.1 技术安全

- 回调必须验签 + 解密，校验 `mchid/appid/amount/out_trade_no`；缺一不发货。
- 金额、时长全部服务端常量；客户端只能选 `plan` id。
- 幂等三层：`out_trade_no` 唯一、订单状态条件更新、`membership_grants` 主键。
- 密钥：私钥/APIv3 密钥只通过环境变量或 600 权限文件读取；日志、错误响应、前端 bundle 均不得出现。
- 私钥 base64 放 systemd `EnvironmentFile`，避免多行 PEM 解析问题。
- 回调接口不要求 Cookie；但校验 `Content-Type` 与签名。下单接口校验 `Origin` 与登录态。
- 订单查询按 `user_id` 过滤，非本人 404。
- 退款接口要求 `PAY_ADMIN_TOKEN`，常量时间比较，未配置时 404。

### 7.2 页面必须展示（微信支付审核/消费者权益）

- 经营主体名称（个体工商户字号）与营业执照信息；
- 客服联系方式（邮箱/微信）与处理时限；
- 会员权益、价格、有效期、**不自动续费**说明；
- 退款规则：虚拟商品支付成功即开通；未使用导出且 7 天内可联系客服原路退款；
- 网站备案号（页脚）。

### 7.3 个体户申请微信支付清单（以商户平台实际审核为准）

1. 个体工商户营业执照（彩色照片/扫描件）；
2. 经营者身份证正反面；
3. 结算银行账户（对公账户或经营者个人账户，按微信要求）；
4. 经营场所证明/门头照；纯线上业务可提供网站首页、商品/服务页截图；
5. 已备案域名（ICP 备案主体建议与营业执照一致；不一致需提供授权材料）；
6. **AppID**：Native 支付需要绑定公众号/小程序/开放平台 AppID。个体户可注册并微信认证
   服务号获取 AppID；没有 AppID 时无法完成 Native 下单；
7. 在商户平台「产品中心」开通「Native 支付」；
8. 设置 APIv3 密钥、下载商户 API 证书/私钥、下载微信支付公钥；
9. 配置回调域名（HTTPS、已备案，不能是 localhost/IP）；
10. 审核通过后把 `mchid/appid/序列号/私钥/APIv3 密钥/公钥` 注入生产 `.env` 并重启。

### 7.4 服务商模式进件清单

1. 选一家已具备「普通服务商」能力的机构，确认它支持 Native 支付与特约商户进件；
2. 向服务商提交：个体工商户营业执照、经营者身份证、结算账户、经营场所/网站截图、
   ICP 备案、客服联系方式、超级管理员信息；
3. 服务商在微信支付服务商平台提交「特约商户进件」，审核通过后返回 `sub_mchid`；
4. 确认 `sub_mchid` 已开通 Native 支付，并完成服务商 AppID 关联；
5. 从服务商获取：`sp_appid`、`sp_mchid`、`sub_mchid`、APIv3 密钥、
   服务商 API 证书序列号/私钥、微信支付公钥（或平台证书）；
6. 项目 `.env` 设置 `WECHAT_PAY_MODE=partner` 及上述字段，回调仍用
   `https://aetouban.cn/api/pay/notify/wechat`；
7. 先做一笔 ¥9.9 真实支付 + 原路退款，再开放给用户。

> 服务商模式不需要你自己注册/认证公众号，省掉 300 元/年认证费；
> 但服务商可能收取通道服务费，签约前确认费率、结算周期、退款与投诉责任。

风险提示：部分省份对“会员制在线服务”可能要求经营性 ICP/EDI 资质；以当地管局和微信支付审核为准。
若审核要求补充资质，先保持 `PAY_ENABLED=false`，不影响现有免费带水印导出。

## 8. 验收标准

### 8.1 功能

- [ ] `PAY_ENABLED=false`：导出响应头 `X-Watermark: 0`，文件与改造前一致；`/api/pay/orders` 503。
- [ ] `PAY_PROVIDER=mock`：未登录下单 401；登录后下单返回 `codeUrl` 与金额 990/6800。
- [ ] mock 支付成功后 `/api/membership` 为 `active:true`，到期时间为 30/365 天后。
- [ ] 同一订单重复 mock-pay 只加一次时长。
- [ ] 未到期再买年卡，到期日叠加而非覆盖。
- [ ] 非会员导出 PNG/PDF/Word 均可见水印；会员导出无水印。
- [ ] 水印不改变 A4 尺寸、页数、分页位置；`[data-resume-page]` 数量不变。
- [ ] 订单查询非本人 404；过期订单不能支付。
- [ ] 回调伪造签名/错误金额不发货，订单进入 `failed` 或保持未支付。
- [ ] 会员中心展示主体、客服、退款规则与「不自动续费」。
- [ ] 全站不再出现「免费导出、不收费、无需注册」的绝对表述（见 4.6 清单）。

### 8.2 视觉

- [ ] 水印在浅色、深色、全幅背景模板上都可读但不遮挡正文；
- [ ] 多页模板每一页都有水印；
- [ ] 二维码弹窗在 1280×720 与 1920×1080 下不溢出；
- [ ] 支付成功态、失效态、未登录态三种 UI 截图留存。

### 8.3 回归

- [ ] `npx tsc --noEmit` 零错误；`npm run build` 成功。
- [ ] `PAY_ENABLED=false` 下 `node scripts/verify.mjs` 47/47。
- [ ] `PAY_ENABLED=false` 下 `node scripts/acceptance.mjs` 28/28。
- [ ] `node scripts/verify-sessions.mjs` 11/11。
- [ ] 新增 `node scripts/verify-pay.mjs` 全过（见 9.1）。

## 9. 测试计划

### 9.1 `scripts/verify-pay.mjs`（mock 通道，纯 HTTP + CDP）

启动方式：

```powershell
$env:PAY_ENABLED = "true"
$env:PAY_PROVIDER = "mock"
$env:NEXT_DIST_DIR = ".next-test"
npm run build
$env:PAY_ENABLED = "true"; $env:PAY_PROVIDER = "mock"; $env:NEXT_DIST_DIR = ".next-test"; npm run start
node scripts/verify-pay.mjs
```

用例（当前脚本覆盖 19 项）：

1. `/api/pay/plans` 为 mock、已开启，月卡 990/30 天、年卡 6800/365 天，返回微信/支付宝通道；
2. 未登录 `POST /api/pay/orders` → 401；
3. 注册用户 A（复用现有注册接口）；
4. 非法档位 → 400；
5. 创建月卡订单 → `pending`、金额 990、`codeUrl` 以 `mock://` 开头；
6. 重复创建同档位 → 复用同一未支付订单；
7. `mock-pay` → 会员 active，到期 ≈ now+30 天；
8. 再次 `mock-pay` → 到期时间不变（订单只发货一次）；
9. 购买年卡并支付 → 在当前到期日上叠加 365 天；
10. 支付宝通道下单 → `channel=alipay`，`mock-pay` 后会员有效；
11. 用户 B 查询 A 的订单 → 404；
12. 不存在的订单 `mock-pay` → 404；
13. mock 模式下微信回调路由 → 404；
14. 匿名导出 PNG：`X-Watermark: 1`、1588×2246；
15. 会员导出 PNG：`X-Watermark: 0`、尺寸一致；
16. 匿名与会员 PNG 字节不同（水印确实渲染）；
17. 文字版 PDF：匿名 `X-Watermark: 1`、会员 `0`、页数一致且字节不同；
18. `EXPECT_PAY_DISABLED=1` 时：pay 接口关闭、已登录下单 503、匿名导出 `X-Watermark: 0`。

> 金额篡改回调、过期订单、真实签名/解密验签不在 mock 脚本内：前者需要构造微信签名报文，
> 后两者依赖真实商户号，放入 M2 真实联调与人工异常演练。

### 9.1.1 服务商模式桩测试

`scripts/verify-wechat-partner.mjs` 启动本地假微信网关（127.0.0.1:9310），应用需以
`WECHAT_PAY_MODE=partner` 和 `WECHAT_PAY_API_BASE=http://127.0.0.1:9310` 启动。
覆盖：partner Native 下单字段（`sp_appid/sp_mchid/sub_mchid/amount`）、
签名头 `mchid`、partner 查单 URL（`sp_mchid&sub_mchid`）、查单成功后发货。
8/8 通过（2026-11-19）。

### 9.1.2 Ping++ 桩测试

`scripts/verify-pingpp.mjs` 启动本地假 Ping++ 网关（127.0.0.1:9320），应用需以
`PAY_PROVIDER=pingpp` 和 `PINGPP_API_BASE=http://127.0.0.1:9320` 启动。
覆盖：Basic API Key、`RSA-SHA256(body+path+timestamp)` 请求签名、
`wx_pub_qr` / `alipay_qr` 下单字段、`GET /v1/charges/{id}` 查单发货、
`charge.succeeded` Webhook 验签发货、伪造签名 401。
13/13 通过（2026-11-19）。

### 9.2 真实微信联调（M2，手工）

- 用 `PAY_PROVIDER=wechat` 启动测试环境，创建月卡订单，微信扫码支付 ¥9.9；
- 验证：回调到达、订单 `paid`、会员生效、导出无水印；
- 用 `scripts/refund-pay.mjs` 原路退款，验证退款回调与订单 `refunded`；
- 在微信商户平台核对账单金额与订单号。

### 9.3 现有测试的兼容策略

- 默认 `PAY_ENABLED=false`，现有 `verify.mjs` / `acceptance.mjs` 不感知水印；
- 任何像素对比脚本（`audit-fidelity`、`export-pages-compare`）也应在 `PAY_ENABLED=false` 下跑，
  或使用会员账号导出；
- CI（`.github/workflows/quality.yml`）只做 `npm ci → tsc → build`，不需要支付配置；
  本地/发布前再跑支付验收。

## 10. 分期

| 期 | 内容 | 出口条件 |
|---|---|---|
| M1 | 数据表、会员判定、水印、mock 通道、`/membership`、导出菜单提示、文案口径 | `verify-pay.mjs` 全过；现有回归全绿；可本地演示完整付费流程 |
| M2 | 商户号申请、Native 真实下单/回调/查单、退款脚本、生产环境变量 | 真机扫码支付成功 + 原路退款成功 + 生产导出无水印 |
| M3 | 到期提醒、订单后台、对账导出、部分退款规则 | 运营可自助查单/退款 |

## 11. 风险与回滚

| 风险 | 处理 |
|---|---|
| 微信支付审核不通过/周期长 | `PAY_ENABLED=false` 保持现状（带水印导出可先不上线），代码与 mock 验收不受影响 |
| 水印破坏现有验收 | 开关隔离；新增 `X-Watermark` 断言；像素脚本固定关闭支付 |
| 回调丢失导致“付了钱没开通” | 轮询查单 + 人工脚本 `scripts/reconcile-pay.mjs`（按 `out_trade_no` 重放发货） |
| 证书/公钥轮换 | 公钥 ID 校验 + 配置化路径；轮换只需换环境变量并重启 |
| 金额单位错误（元/分） | 全链路只用“分”，数据库 `amount_fen`，测试断言 990/6800 |
| 文案改动影响 SEO 收录 | 先小范围改（首页/FAQ/模板页），保留核心关键词；上线后看 Search Console |
| 数据表迁移失败 | 全部 `IF NOT EXISTS`；回滚只需停用代码，表可保留不用 |

**回滚步骤**：

1. 生产 `.env` 设 `PAY_ENABLED=false`，重启 `blazecv`；
2. 导出立即恢复无水印，支付接口 503；
3. 已购买会员数据保留在 `memberships`，重新开启后继续有效；
4. 若需回退代码：按 `CLAUDE.md` 第 8 步切换 `.next.prev-*`；
5. 数据库无需回滚（增量表向后兼容）。

## 12. 待确认（实现前定稿）

| 项 | 当前占位 | 需要谁定 |
|---|---|---|
| 经营主体名称、备案号、客服邮箱 | `主体名称` / `京ICP备xxxxxxxx号` / `support@example.com` | 用户 |
| 公众号/小程序 AppID | 空 | 用户申请后提供 |
| 退款窗口与例外 | 7 天、未使用导出 | 用户确认 |
| 发票 | 人工开具，页面写“如需发票联系客服” | 用户确认 |
| 生产注入方式 | systemd `EnvironmentFile` + base64 私钥 | 用户确认 |

## 13. 变更文件清单（实现时对照）

**新增**

- `src/lib/server/payments/plans.ts`
- `src/lib/server/payments/provider.ts`
- `src/lib/server/payments/wechat.ts`
- `src/lib/server/payments/mock.ts`
- `src/lib/server/payments/orders.ts`（创建/查询/发货/退款）
- `src/lib/server/payments/watermark.ts`（服务端注入脚本）
- `src/lib/server/membership.ts`
- `src/app/api/membership/route.ts`
- `src/app/api/pay/plans/route.ts`
- `src/app/api/pay/orders/route.ts`
- `src/app/api/pay/orders/[id]/route.ts`
- `src/app/api/pay/orders/[id]/mock-pay/route.ts`
- `src/app/api/pay/notify/wechat/route.ts`
- `src/app/membership/page.tsx`
- `src/components/membership/*`（计划卡、二维码弹窗、状态）
- `src/lib/use-membership.ts`
- `scripts/verify-pay.mjs`
- `scripts/verify-pay-ui.mjs`
- `scripts/verify-wechat-partner.mjs`
- `scripts/verify-pingpp.mjs`
- `src/lib/server/payments/pingpp.ts`
- `src/app/api/pay/notify/pingpp/route.ts`
- `scripts/refund-pay.mjs`（M2）
- `scripts/reconcile-pay.mjs`（M2）

**修改**

- `src/lib/server/db.ts`（SCHEMA + `transaction`）
- `infra/db/migrations/0001_init.sql`
- `src/app/api/export-image/route.ts`（水印 + `X-Watermark`）
- `src/app/api/export-pdf/route.ts`（水印 + `X-Watermark`）
- `src/lib/exact-export.ts`（客户端回退水印、读取响应头）
- `src/components/Toolbar.tsx`（导出菜单徽标/提示）
- `src/components/account/CloudMenu.tsx`（会员入口、登录事件）
- `.env.example`
- 4.6 列出的文案/SEO 文件
- `CLAUDE.md`（部署流程增加支付环境变量与冒烟项）
- `docs/roadmap.md`（商业化状态）

## 14. M1 实现结果（2026-11-18）

本地以 `PAY_ENABLED=true PAY_PROVIDER=mock`、独立 PGlite 目录启动，实际跑通：

| 命令 | 结果 |
|---|---|
| `npx tsc --noEmit` | 零错误 |
| `npm run build` | 成功（102 个静态页） |
| `node scripts/verify-pay.mjs` | 19/19（下单、复用、30/365 天、幂等、越权、微信/支付宝、PNG/PDF 水印） |
| `node scripts/verify-pay-ui.mjs` | 12/12（未登录引导、登录、微信/支付宝切换、下单、mock 支付、会员生效、无运行时错误） |
| `node scripts/verify-wechat-partner.mjs` | 8/8（partner 下单字段、签名头、查单 URL、发货；本地假网关） |
| `node scripts/verify-pingpp.mjs` | 13/13（请求签名、微信/支付宝下单字段、查单发货、Webhook 验签、伪造签名拒绝；本地假网关） |
| `node scripts/verify.mjs`（PAY_ENABLED=false） | 47/47 |
| `node scripts/verify.mjs`（PAY_ENABLED=true） | 47/47 |
| `node scripts/acceptance.mjs`（PAY_ENABLED=false） | 28/28 |
| `node scripts/verify-sessions.mjs` | 11/11 |
| `verify-pay.mjs` + `EXPECT_PAY_DISABLED=1` | 3/3（开关回退：接口 503、导出无水印） |

M1 已可用；真实微信支付仍需按 7.3 申请商户号/AppID 并走 9.2 联调。


import { randomInt, randomUUID } from "node:crypto";
import { getDb } from "../db";
import { getMembershipStatus, type MembershipStatus } from "../membership";
import { getPlan, type PlanId } from "./plans";
import { getPayProvider, type PayChannel } from "./provider";

export type OrderStatus =
  | "created"
  | "pending"
  | "paid"
  | "failed"
  | "expired"
  | "closed"
  | "refunded";

export interface PaymentOrderRow {
  [key: string]: unknown;
  id: string;
  out_trade_no: string;
  user_id: string;
  plan: string;
  amount_fen: number;
  status: OrderStatus;
  provider: string;
  channel: string;
  sub_mchid: string | null;
  code_url: string | null;
  provider_trade_no: string | null;
  created_at: unknown;
  updated_at: unknown;
  expires_at: unknown;
  paid_at: unknown;
  last_checked_at: unknown;
  refunded_at: unknown;
}

export interface OrderView {
  id: string;
  outTradeNo: string;
  plan: string;
  planTitle: string;
  amountFen: number;
  status: OrderStatus;
  channel: PayChannel;
  codeUrl: string | null;
  expiresAt: string;
  paidAt: string | null;
}

export class OrderError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = "OrderError";
    this.status = status;
    this.code = code;
  }
}

function toIso(value: unknown): string {
  if (value instanceof Date) return value.toISOString();
  const parsed = new Date(String(value));
  return Number.isNaN(parsed.getTime()) ? new Date().toISOString() : parsed.toISOString();
}

function toIsoOrNull(value: unknown): string | null {
  if (!value) return null;
  const parsed = new Date(String(value));
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

function orderNo(now = new Date()): string {
  const pad = (value: number) => String(value).padStart(2, "0");
  const stamp =
    `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}` +
    `${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let suffix = "";
  for (let i = 0; i < 6; i += 1) suffix += alphabet[randomInt(alphabet.length)];
  return `BC${stamp}${suffix}`;
}

export function toOrderView(row: PaymentOrderRow): OrderView {
  const plan = getPlan(row.plan);
  return {
    id: row.id,
    outTradeNo: row.out_trade_no,
    plan: row.plan,
    planTitle: plan?.title ?? row.plan,
    amountFen: Number(row.amount_fen),
    status: row.status,
    channel: row.channel === "alipay" ? "alipay" : "wechat",
    codeUrl: row.code_url,
    expiresAt: toIso(row.expires_at),
    paidAt: toIsoOrNull(row.paid_at),
  };
}

async function selectOrder(
  where: string,
  params: unknown[],
): Promise<PaymentOrderRow | null> {
  const database = await getDb();
  const result = await database.query<PaymentOrderRow>(
    `SELECT * FROM payment_orders WHERE ${where} LIMIT 1`,
    params,
  );
  return result.rows[0] ?? null;
}

export async function createOrder(
  userId: string,
  planId: PlanId,
  channel: PayChannel,
  clientIp?: string,
): Promise<OrderView> {
  const plan = getPlan(planId);
  if (!plan) throw new OrderError(400, "INVALID_PLAN", "会员档位不存在");

  const provider = getPayProvider();
  const database = await getDb();

  // Reuse an unpaid order for the same plan so double clicks don't create a
  // second QR code. Expired/paid orders are never reused.
  const existing = await database.query<PaymentOrderRow>(
    `SELECT * FROM payment_orders
      WHERE user_id = $1 AND plan = $2 AND provider = $3 AND channel = $4
        AND status = 'pending' AND expires_at > now() AND code_url IS NOT NULL
      ORDER BY created_at DESC LIMIT 1`,
    [userId, plan.id, provider.id, channel],
  );
  if (existing.rows[0]) return toOrderView(existing.rows[0]);

  const id = randomUUID();
  const tradeNo = orderNo();
  const ttlSeconds = Math.max(
    120,
    Number(process.env.PAY_ORDER_TTL_SECONDS ?? "") || 900,
  );
  const expiresAt = new Date(Date.now() + ttlSeconds * 1000);
  const subMerchantId = provider.subMerchantId?.() ?? null;

  // 免签通道用唯一尾数区分同时段的个人收款码订单：同一金额在 30 分钟内
  // 已被占用时上浮 1 分，最多上浮 99 分。
  let amountFen = plan.amountFen;
  if (provider.payableAmountFen) {
    amountFen = Math.max(
      1,
      Math.round(provider.payableAmountFen(plan.amountFen, tradeNo)),
    );
    for (let i = 0; i < 99; i += 1) {
      const clash = await database.query<{ id: string }>(
        `SELECT id FROM payment_orders
          WHERE provider = $1 AND amount_fen = $2
            AND status IN ('pending', 'expired')
            AND created_at > now() - interval '30 minutes'
          LIMIT 1`,
        [provider.id, amountFen],
      );
      if (clash.rows.length === 0) break;
      amountFen += 1;
    }
  }

  await database.query(
    `INSERT INTO payment_orders
       (id, out_trade_no, user_id, plan, amount_fen, status, provider, channel, sub_mchid, attach, expires_at)
     VALUES ($1, $2, $3, $4, $5, 'created', $6, $7, $8, $9::jsonb, $10)`,
    [
      id,
      tradeNo,
      userId,
      plan.id,
      amountFen,
      provider.id,
      channel,
      subMerchantId,
      JSON.stringify({ plan: plan.id }),
      expiresAt,
    ],
  );

  let created;
  try {
    created = await provider.createNativeOrder({
      outTradeNo: tradeNo,
      description: `BlazeCV ${plan.title}`,
      amountFen,
      expiresAt,
      attach: plan.id,
      channel,
      clientIp,
    });
  } catch (error) {
    await database
      .query(
        `UPDATE payment_orders SET status = 'failed', updated_at = now() WHERE id = $1`,
        [id],
      )
      .catch(() => undefined);
    throw error;
  }

  const updated = await database.query<PaymentOrderRow>(
    `UPDATE payment_orders
        SET status = 'pending', code_url = $2,
            provider_trade_no = COALESCE($3, provider_trade_no),
            updated_at = now()
      WHERE id = $1
      RETURNING *`,
    [id, created.codeUrl, created.providerTradeNo ?? null],
  );
  return toOrderView(updated.rows[0]);
}

interface FulfillInput {
  providerTradeNo?: string;
  amountFen: number;
  eventId: string;
  eventType: string;
  payload: unknown;
}

export interface FulfillResult {
  ok: boolean;
  reason?: "not_found" | "amount_mismatch" | "refunded" | "unknown_plan";
  membership?: MembershipStatus;
}

/**
 * Idempotent fulfillment. Safe to call from the callback, the polling query
 * path, mock-pay, and the reconciliation script with the same event id.
 */
export async function fulfillOrder(
  outTradeNo: string,
  input: FulfillInput,
): Promise<FulfillResult> {
  const database = await getDb();

  return database.transaction(async (tx) => {
    const found = await tx.query<PaymentOrderRow>(
      `SELECT * FROM payment_orders WHERE out_trade_no = $1 FOR UPDATE`,
      [outTradeNo],
    );
    const order = found.rows[0];
    if (!order) return { ok: false, reason: "not_found" as const };

    await tx.query(
      `INSERT INTO payment_events (id, out_trade_no, event_type, payload)
       VALUES ($1, $2, $3, $4::jsonb)
       ON CONFLICT (id) DO NOTHING`,
      [input.eventId, outTradeNo, input.eventType, JSON.stringify(input.payload ?? {})],
    );

    if (order.status === "refunded") {
      return { ok: false, reason: "refunded" as const };
    }

    if (Number(input.amountFen) !== Number(order.amount_fen)) {
      if (order.status !== "paid") {
        await tx.query(
          `UPDATE payment_orders SET status = 'failed', updated_at = now() WHERE id = $1`,
          [order.id],
        );
      }
      return { ok: false, reason: "amount_mismatch" as const };
    }

    if (order.status !== "paid") {
      // provider_trade_no 有唯一索引。辅助流水号若与另一笔订单重复（网关
      // 回传异常或测试桩复用），不能让整个发货事务 23505 回滚：跳过写入，
      // 会员照常开通。
      let safeTradeNo = input.providerTradeNo ?? null;
      if (safeTradeNo) {
        const clash = await tx.query<{ id: string }>(
          `SELECT id FROM payment_orders
            WHERE provider_trade_no = $1 AND id <> $2 LIMIT 1`,
          [safeTradeNo, order.id],
        );
        if (clash.rows.length > 0) safeTradeNo = null;
      }
      await tx.query(
        `UPDATE payment_orders
            SET status = 'paid', paid_at = COALESCE(paid_at, now()),
                provider_trade_no = COALESCE($2, provider_trade_no),
                updated_at = now()
          WHERE id = $1`,
        [order.id, safeTradeNo],
      );
    }

    const plan = getPlan(order.plan);
    if (!plan) return { ok: false, reason: "unknown_plan" as const };

    const grant = await tx.query<{ order_id: string }>(
      `INSERT INTO membership_grants (order_id, user_id, plan, days)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (order_id) DO NOTHING
       RETURNING order_id`,
      [order.id, order.user_id, plan.id, plan.days],
    );

    if (grant.rows.length > 0) {
      await tx.query(
        `INSERT INTO memberships (user_id, plan, expires_at, updated_at)
         VALUES ($1, $2, now() + make_interval(days => $3::int), now())
         ON CONFLICT (user_id) DO UPDATE SET
           plan = EXCLUDED.plan,
           expires_at = GREATEST(memberships.expires_at, now()) + make_interval(days => $3::int),
           updated_at = now()`,
        [order.user_id, plan.id, plan.days],
      );
    }

    const membership = await tx.query<{ plan: string; expires_at: unknown }>(
      `SELECT plan, expires_at FROM memberships WHERE user_id = $1`,
      [order.user_id],
    );
    const row = membership.rows[0];
    const expiresAt = row ? toIso(row.expires_at) : null;
    return {
      ok: true,
      membership: row
        ? {
            active: expiresAt !== null && new Date(expiresAt).getTime() > Date.now(),
            plan: row.plan,
            expiresAt,
          }
        : {
            active: false,
            plan: null,
            expiresAt: null,
          },
    };
  });
}

async function refreshPendingOrder(
  order: PaymentOrderRow,
): Promise<PaymentOrderRow> {
  if (order.status !== "pending") return order;
  const database = await getDb();

  if (new Date(toIso(order.expires_at)).getTime() <= Date.now()) {
    await database.query(
      `UPDATE payment_orders SET status = 'expired', updated_at = now()
        WHERE id = $1 AND status = 'pending'`,
      [order.id],
    );
    return (await selectOrder("id = $1", [order.id])) ?? order;
  }

  // At most one query per 10 seconds per order, so polling clients don't hammer
  // the WeChat API.
  const claimed = await database.query<{ id: string }>(
    `UPDATE payment_orders SET last_checked_at = now()
      WHERE id = $1 AND status = 'pending'
        AND (last_checked_at IS NULL OR last_checked_at < now() - interval '10 seconds')
      RETURNING id`,
    [order.id],
  );
  if (claimed.rows.length === 0) return order;

  try {
    const provider = getPayProvider();
    const remote = await provider.queryOrder(
      order.out_trade_no,
      order.provider_trade_no,
    );
    if (remote.state === "paid") {
      await fulfillOrder(order.out_trade_no, {
        providerTradeNo:
          remote.providerTradeNo ?? order.provider_trade_no ?? undefined,
        amountFen: remote.amountFen ?? Number(order.amount_fen),
        eventId: `query:${order.out_trade_no}:${remote.providerTradeNo ?? "paid"}`,
        eventType: "QUERY.SUCCESS",
        payload: remote,
      });
    } else if (remote.state === "closed") {
      await database.query(
        `UPDATE payment_orders SET status = 'closed', updated_at = now()
          WHERE id = $1 AND status = 'pending'`,
        [order.id],
      );
    }
  } catch (error) {
    // The callback or a later poll will retry; never fail order lookup here.
    if (process.env.PAY_DEBUG === "true") {
      console.error(
        "[pay] query failed",
        error instanceof Error ? error.name : typeof error,
        (error as { code?: unknown })?.code,
      );
    }
  }

  return (await selectOrder("id = $1", [order.id])) ?? order;
}

export async function getOrderForUser(
  userId: string,
  orderId: string,
): Promise<OrderView | null> {
  if (!/^[0-9a-f-]{36}$/i.test(orderId)) return null;
  const row = await selectOrder("id = $1 AND user_id = $2", [orderId, userId]);
  if (!row) return null;
  return toOrderView(await refreshPendingOrder(row));
}

export interface MockPayResult {
  order: OrderView;
  membership: MembershipStatus;
}

export async function applyMockPaid(
  userId: string,
  orderId: string,
): Promise<MockPayResult> {
  if (!/^[0-9a-f-]{36}$/i.test(orderId)) {
    throw new OrderError(404, "NOT_FOUND", "订单不存在");
  }
  const order = await selectOrder("id = $1 AND user_id = $2", [orderId, userId]);
  if (!order || order.provider !== "mock") {
    throw new OrderError(404, "NOT_FOUND", "订单不存在");
  }

  if (order.status === "paid") {
    return {
      order: toOrderView(order),
      membership: await getMembershipStatus(userId),
    };
  }
  if (order.status !== "pending") {
    throw new OrderError(409, "ORDER_NOT_PAYABLE", "订单已失效，请重新下单");
  }
  if (new Date(toIso(order.expires_at)).getTime() <= Date.now()) {
    const database = await getDb();
    await database.query(
      `UPDATE payment_orders SET status = 'expired', updated_at = now()
        WHERE id = $1 AND status = 'pending'`,
      [order.id],
    );
    throw new OrderError(409, "ORDER_EXPIRED", "二维码已过期，请重新下单");
  }

  const result = await fulfillOrder(order.out_trade_no, {
    providerTradeNo: `MOCK${order.out_trade_no}`,
    amountFen: Number(order.amount_fen),
    eventId: `mock:${order.out_trade_no}:paid`,
    eventType: "MOCK.SUCCESS",
    payload: { out_trade_no: order.out_trade_no, trade_state: "SUCCESS" },
  });
  if (!result.ok) {
    throw new OrderError(409, "ORDER_NOT_PAYABLE", "订单状态异常，请重新下单");
  }

  const fresh = await selectOrder("id = $1", [order.id]);
  return {
    order: toOrderView(fresh ?? order),
    membership: result.membership ?? (await getMembershipStatus(userId)),
  };
}

export interface QrNotifyCandidate {
  outTradeNo: string;
  amountFen: number;
  status: OrderStatus;
}

/**
 * 免签到账匹配：按金额找出最近仍在等待/刚过期的个人收款码订单。
 * 待支付排在已过期之前；超过 graceMinutes 的旧订单不参与匹配，避免串单。
 */
export async function findQrNotifyCandidates(
  amountFen: number,
  graceMinutes = 20,
): Promise<QrNotifyCandidate[]> {
  const database = await getDb();
  const result = await database.query<PaymentOrderRow>(
    `SELECT * FROM payment_orders
      WHERE provider = 'qrnotify' AND amount_fen = $1
        AND status IN ('pending', 'expired')
        AND created_at > now() - make_interval(mins => $2::int)
      ORDER BY CASE status WHEN 'pending' THEN 0 ELSE 1 END, created_at DESC
      LIMIT 5`,
    [amountFen, graceMinutes],
  );
  return result.rows.map((row) => ({
    outTradeNo: row.out_trade_no,
    amountFen: Number(row.amount_fen),
    status: row.status,
  }));
}

/** 监听程序显式带 out_trade_no 时，确认订单确实属于免签通道。 */
export async function getQrNotifyOrder(
  outTradeNo: string,
): Promise<QrNotifyCandidate | null> {
  const row = await selectOrder(
    "out_trade_no = $1 AND provider = 'qrnotify'",
    [outTradeNo],
  );
  if (!row) return null;
  return {
    outTradeNo: row.out_trade_no,
    amountFen: Number(row.amount_fen),
    status: row.status,
  };
}

/** 备注模式：金额必须一致，且付款备注包含订单号后 6 位（不区分大小写）。 */
export function filterQrCandidatesByRemark(
  candidates: QrNotifyCandidate[],
  remark: string,
): QrNotifyCandidate[] {
  const note = remark.trim().toUpperCase();
  if (!note) return [];
  return candidates.filter((candidate) =>
    note.includes(candidate.outTradeNo.slice(-6).toUpperCase()),
  );
}

export interface ReconcileSummary {
  checked: number;
  paid: number;
  closed: number;
  unknown: number;
  errors: number;
}

/**
 * 对账补齐：回调丢失时主动查单。仅对支持查单的通道有效
 * （免签通道 queryOrder 永远返回 unknown，不会误发货）。
 */
export async function reconcilePendingOrders(
  limit = 50,
): Promise<ReconcileSummary> {
  const provider = getPayProvider();
  const database = await getDb();
  const rows = await database.query<PaymentOrderRow>(
    `SELECT * FROM payment_orders
      WHERE provider = $1 AND status = 'pending'
        AND created_at > now() - interval '24 hours'
      ORDER BY created_at ASC
      LIMIT $2`,
    [provider.id, Math.max(1, Math.min(200, limit))],
  );

  const summary: ReconcileSummary = {
    checked: 0,
    paid: 0,
    closed: 0,
    unknown: 0,
    errors: 0,
  };

  for (const order of rows.rows) {
    summary.checked += 1;
    try {
      const remote = await provider.queryOrder(
        order.out_trade_no,
        order.provider_trade_no,
      );
      if (remote.state === "paid") {
        const result = await fulfillOrder(order.out_trade_no, {
          providerTradeNo:
            remote.providerTradeNo ?? order.provider_trade_no ?? undefined,
          amountFen: remote.amountFen ?? Number(order.amount_fen),
          eventId: `reconcile:${order.out_trade_no}:${remote.providerTradeNo ?? "paid"}`,
          eventType: "RECONCILE.SUCCESS",
          payload: remote,
        });
        if (result.ok) summary.paid += 1;
        else summary.errors += 1;
      } else if (remote.state === "closed") {
        await database.query(
          `UPDATE payment_orders SET status = 'closed', updated_at = now()
            WHERE id = $1 AND status = 'pending'`,
          [order.id],
        );
        summary.closed += 1;
      } else {
        summary.unknown += 1;
      }
    } catch (error) {
      summary.errors += 1;
      if (process.env.PAY_DEBUG === "true") {
        console.error(
          "[pay] reconcile failed",
          error instanceof Error ? error.name : typeof error,
          (error as { code?: unknown })?.code,
        );
      }
    }
    await database
      .query(`UPDATE payment_orders SET last_checked_at = now() WHERE id = $1`, [
        order.id,
      ])
      .catch(() => undefined);
  }

  return summary;
}

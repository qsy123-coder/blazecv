"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui";
import { Icon } from "@/components/icons";
import {
  PAY_CHANNEL_LABELS,
  type PayChannel,
  type PayProviderId,
} from "@/lib/pay-channels";
import { PAYMENT_INFO } from "@/lib/payment-info";
import { notifyMembershipChanged, useMembership } from "@/lib/use-membership";
import { PayDialog, type PayOrder } from "./PayDialog";

interface PlanDto {
  id: "month" | "year";
  title: string;
  amountFen: number;
  days: number;
  priceLabel: string;
}

interface ChannelDto {
  id: PayChannel;
  label: string;
}

interface PlansResponse {
  enabled: boolean;
  payEnabled: boolean;
  provider: PayProviderId;
  channels: ChannelDto[];
  plans: PlanDto[];
}

function formatAmount(fen: number): string {
  return `¥${(fen / 100).toFixed(2).replace(/\.00$/, "")}`;
}

function formatDate(value: string | null): string {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
}

export function MembershipCenter() {
  const membership = useMembership();
  const [plans, setPlans] = useState<PlansResponse | null>(null);
  const [method, setMethod] = useState<PayChannel>("wechat");
  const [dialog, setDialog] = useState<{
    order: PayOrder;
    provider: PayProviderId;
  } | null>(null);
  const [busyPlan, setBusyPlan] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [justPaid, setJustPaid] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const response = await fetch("/api/pay/plans", { cache: "no-store" });
        const data = (await response.json()) as PlansResponse;
        if (!cancelled) {
          setPlans(data);
          setMethod((current) =>
            data.channels.some((item) => item.id === current)
              ? current
              : (data.channels[0]?.id ?? "wechat"),
          );
        }
      } catch {
        /* keep the page usable; buttons stay disabled */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!membership.loggedIn) return;
    setMessage((current) =>
      current?.startsWith("请先登录") ? null : current,
    );
  }, [membership.loggedIn]);

  const handlePaid = useCallback(() => {
    setJustPaid(true);
    notifyMembershipChanged();
    void membership.refresh();
  }, [membership.refresh]);

  const start = async (planId: string) => {
    setMessage(null);
    if (!membership.loggedIn) {
      window.dispatchEvent(new Event("blazecv:open-login"));
      setMessage("请先登录，登录后回到本页继续开通会员");
      return;
    }
    setBusyPlan(planId);
    try {
      const response = await fetch("/api/pay/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan: planId, channel: method }),
      });
      const data = (await response.json().catch(() => ({}))) as {
        order?: PayOrder;
        error?: string;
      };
      if (response.status === 401) {
        window.dispatchEvent(new Event("blazecv:open-login"));
        setMessage("登录状态已失效，请重新登录");
        return;
      }
      if (!response.ok || !data.order) {
        setMessage(data.error ?? "下单失败，请稍后重试");
        return;
      }
      setDialog({
        order: data.order,
        provider: plans?.provider ?? "wechat",
      });
    } catch {
      setMessage("网络异常，请稍后重试");
    } finally {
      setBusyPlan(null);
    }
  };

  const enabled = Boolean(plans?.enabled);
  const channels = plans?.channels ?? [];
  const canPay = enabled && channels.length > 0;
  const active = membership.active;

  return (
    <>
      <main className="mx-auto w-full max-w-4xl px-6 py-12">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
              BlazeCV 会员
            </h1>
            <p className="mt-2 text-[13px] text-slate-500">
              编辑、预览与带水印导出免费；会员导出无水印，适合直接投递。
            </p>
          </div>
          {plans?.provider === "mock" ? (
            <span className="rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-[11px] text-amber-700">
              本地 mock 联调模式
            </span>
          ) : null}
        </div>

        <section className="mt-6 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          {membership.loading ? (
            <p className="text-[12px] text-slate-400">正在读取会员状态…</p>
          ) : active ? (
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-emerald-50 text-emerald-600">
                  <Icon name="check" size={20} />
                </div>
                <div>
                  <p className="text-[14px] font-semibold text-slate-900">
                    会员有效
                  </p>
                  <p className="mt-0.5 text-[12px] text-slate-500">
                    到期时间 {formatDate(membership.expiresAt)} · 到期不自动续费
                  </p>
                </div>
              </div>
              <span className="rounded-full bg-slate-900 px-3 py-1 text-[11px] text-white">
                导出无水印
              </span>
            </div>
          ) : (
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-[14px] font-semibold text-slate-900">
                  {membership.loggedIn ? "当前为免费版" : "尚未登录"}
                </p>
                <p className="mt-0.5 text-[12px] text-slate-500">
                  {membership.loggedIn
                    ? "导出会带水印；开通会员后立即去除。"
                    : "免费版可以编辑、预览并带水印导出；开通会员需要登录。"}
                </p>
              </div>
              {justPaid ? (
                <span className="text-[12px] font-medium text-emerald-600">
                  已开通
                </span>
              ) : null}
            </div>
          )}
        </section>

        {!enabled ? (
          <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-[12px] text-amber-700">
            支付正在开通中。你仍可免费编辑、预览并导出带水印文件；正式开放后这里会出现支付二维码。
          </div>
        ) : null}

        {channels.length > 0 ? (
          <section className="mt-6 flex flex-wrap items-center gap-2">
            <span className="mr-1 text-[12px] text-slate-500">支付方式</span>
            {channels.map((channel) => (
              <button
                key={channel.id}
                type="button"
                onClick={() => setMethod(channel.id)}
                className={`h-9 rounded-md border px-3 text-[12px] font-medium transition ${
                  method === channel.id
                    ? "border-slate-900 bg-slate-900 text-white"
                    : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                }`}
              >
                {channel.label}
              </button>
            ))}
          </section>
        ) : null}

        <section className="mt-6 grid gap-4 sm:grid-cols-2">
          {(plans?.plans ?? []).map((plan) => {
            const saving =
              plan.id === "year" && plans
                ? 990 * 12 - plan.amountFen
                : 0;
            return (
              <div
                key={plan.id}
                className={`rounded-xl border bg-white p-5 shadow-sm ${
                  plan.id === "year"
                    ? "border-slate-900"
                    : "border-slate-200"
                }`}
              >
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-[15px] font-semibold text-slate-900">
                      {plan.title}
                    </p>
                    <p className="mt-1 text-[11px] text-slate-400">
                      有效期 {plan.days} 天 · 不自动续费
                    </p>
                  </div>
                  {plan.id === "year" ? (
                    <span className="rounded-full bg-slate-900 px-2.5 py-1 text-[10px] text-white">
                      推荐
                    </span>
                  ) : null}
                </div>

                <div className="mt-4 flex items-end gap-2">
                  <span className="text-2xl font-semibold tracking-tight text-slate-900">
                    {plan.priceLabel}
                  </span>
                  <span className="pb-1 text-[11px] text-slate-400">
                    / {plan.days} 天
                  </span>
                </div>
                {saving > 0 ? (
                  <p className="mt-1 text-[11px] text-emerald-600">
                    比按月购买省 {formatAmount(saving)}
                  </p>
                ) : (
                  <p className="mt-1 text-[11px] text-slate-400">
                    适合短周期求职
                  </p>
                )}

                <Button
                  variant={plan.id === "year" ? "primary" : "default"}
                  className="mt-5 w-full"
                  disabled={!canPay || busyPlan !== null}
                  onClick={() => void start(plan.id)}
                >
                  {busyPlan === plan.id
                    ? "正在创建订单…"
                    : `${active ? "续费" : "立即开通"} · ${PAY_CHANNEL_LABELS[method]}`}
                </Button>
              </div>
            );
          })}
        </section>

        {message ? (
          <p className="mt-4 rounded-md bg-slate-100 px-3 py-2 text-[12px] text-slate-600">
            {message}
          </p>
        ) : null}

        <section className="mt-8 grid gap-4 sm:grid-cols-2">
          <div className="rounded-xl border border-slate-200 bg-white p-5">
            <h2 className="text-[13px] font-semibold text-slate-900">
              会员权益
            </h2>
            <ul className="mt-3 space-y-2 text-[12px] text-slate-600">
              {[
                "导出 PNG / PDF / Word 不带水印",
                "多页简历逐页无水印",
                "会员期内不限导出次数",
                "到期不自动续费，续费时长叠加",
              ].map((item) => (
                <li key={item} className="flex items-start gap-2">
                  <Icon name="check" size={14} className="mt-0.5 text-emerald-600" />
                  {item}
                </li>
              ))}
            </ul>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-5">
            <h2 className="text-[13px] font-semibold text-slate-900">
              购买与退款
            </h2>
            <div className="mt-3 space-y-2 text-[12px] leading-relaxed text-slate-600">
              <p>· 虚拟商品，支付成功即开通会员。</p>
              <p>
                · 未使用导出且支付后 {PAYMENT_INFO.refundWindowDays} 天内，可联系客服原路退款。
              </p>
              <p>· 已使用无水印导出后不支持退款。</p>
              <p>· 如需发票，请联系客服登记。</p>
              <p className="text-slate-500">
                客服邮箱：{PAYMENT_INFO.supportEmail}
              </p>
            </div>
          </div>
        </section>

        <section className="mt-8 rounded-xl border border-slate-200 bg-slate-50 p-5 text-[11px] leading-relaxed text-slate-500">
          <p>经营主体：{PAYMENT_INFO.businessName}</p>
          {PAYMENT_INFO.icp ? <p>备案号：{PAYMENT_INFO.icp}</p> : null}
          <p>
            支付由微信支付提供。订单与会员状态仅用于开通权益与售后核对，不会用于其他用途。
          </p>
        </section>
      </main>

      {dialog ? (
        <PayDialog
          order={dialog.order}
          provider={dialog.provider}
          onClose={() => setDialog(null)}
          onPaid={handlePaid}
        />
      ) : null}
    </>
  );
}

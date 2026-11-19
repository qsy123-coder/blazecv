"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Button } from "@/components/ui";
import { Icon } from "@/components/icons";
import type { PayProviderId } from "@/lib/pay-channels";

export interface PayOrder {
  id: string;
  outTradeNo: string;
  plan: string;
  planTitle: string;
  amountFen: number;
  status: string;
  channel: "wechat" | "alipay";
  codeUrl: string | null;
  expiresAt: string;
  paidAt: string | null;
}

interface PayDialogProps {
  order: PayOrder;
  provider: PayProviderId;
  onClose: () => void;
  onPaid: () => void;
}

function formatAmount(fen: number): string {
  return `¥${(fen / 100).toFixed(2).replace(/\.00$/, "")}`;
}

function formatRemaining(expiresAt: string): string {
  const ms = new Date(expiresAt).getTime() - Date.now();
  if (ms <= 0) return "00:00";
  const total = Math.floor(ms / 1000);
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

export function PayDialog({ order, provider, onClose, onPaid }: PayDialogProps) {
  const [status, setStatus] = useState(order.status);
  const [qr, setQr] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [remaining, setRemaining] = useState(() => formatRemaining(order.expiresAt));
  const paidRef = useRef(false);

  const terminal = status === "paid";
  const invalid = status === "expired" || status === "closed" || status === "failed";
  const channelLabel = order.channel === "alipay" ? "支付宝" : "微信";
  // 个人收款码通道可能只配置了图片；这种 codeUrl 直接展示，不再二次编码。
  const qrImage =
    order.codeUrl?.startsWith("/api/pay/qr-image") ? order.codeUrl : null;

  useEffect(() => {
    if (paidRef.current) return;
    let cancelled = false;
    const codeUrl = order.codeUrl;
    if (!codeUrl || qrImage) return;

    void (async () => {
      try {
        const QRCode = await import("qrcode");
        const dataUrl = await QRCode.toDataURL(codeUrl, {
          margin: 1,
          width: 240,
          color: { dark: "#0f172a", light: "#ffffff" },
        });
        if (!cancelled) setQr(dataUrl);
      } catch {
        if (!cancelled) setError("二维码生成失败，请刷新页面重试");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [order.codeUrl, qrImage]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setRemaining(formatRemaining(order.expiresAt));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [order.expiresAt]);

  useEffect(() => {
    let cancelled = false;
    let timer: number | undefined;

    const poll = async () => {
      if (paidRef.current) return;
      try {
        const response = await fetch(`/api/pay/orders/${order.id}`, {
          cache: "no-store",
        });
        if (!response.ok) return;
        const data = (await response.json()) as { order?: { status?: string } };
        const next = data.order?.status;
        if (cancelled || !next) return;
        setStatus(next);
        if (next === "paid") {
          paidRef.current = true;
          if (timer) window.clearInterval(timer);
          onPaid();
        } else if (next === "expired" || next === "closed" || next === "failed") {
          if (timer) window.clearInterval(timer);
        }
      } catch {
        /* keep polling */
      }
    };

    void poll();
    timer = window.setInterval(poll, 2000);
    return () => {
      cancelled = true;
      if (timer) window.clearInterval(timer);
    };
  }, [order.id, onPaid]);

  const mockPay = async () => {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`/api/pay/orders/${order.id}/mock-pay`, {
        method: "POST",
      });
      const data = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) {
        setError(data.error ?? "模拟支付失败");
        return;
      }
      paidRef.current = true;
      setStatus("paid");
      onPaid();
    } catch {
      setError("网络异常，请重试");
    } finally {
      setBusy(false);
    }
  };

  return createPortal(
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center overflow-y-auto bg-slate-900/45 p-6 backdrop-blur-[2px]"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-sm rounded-xl bg-white p-5 shadow-2xl">
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-[15px] font-semibold text-slate-900">
              {terminal ? "开通成功" : `${channelLabel}扫码支付`}
            </h2>
            <p className="mt-0.5 text-[11px] text-slate-400">
              {order.planTitle} · {formatAmount(order.amountFen)} · 不自动续费
            </p>
          </div>
          <button
            type="button"
            aria-label="关闭"
            onClick={onClose}
            className="rounded-md p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
          >
            <Icon name="x" size={18} />
          </button>
        </div>

        {terminal ? (
          <div className="mt-8 flex flex-col items-center gap-3 pb-2">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-emerald-50 text-emerald-600">
              <Icon name="check" size={24} />
            </div>
            <p className="text-[13px] font-medium text-slate-800">
              会员已开通，导出不再带水印
            </p>
            <Button variant="primary" className="mt-2 w-full" onClick={onClose}>
              完成
            </Button>
          </div>
        ) : invalid ? (
          <div className="mt-8 flex flex-col items-center gap-3 pb-2">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-amber-50 text-amber-600">
              <Icon name="alert" size={24} />
            </div>
            <p className="text-[13px] text-slate-700">二维码已失效，请重新下单</p>
            <Button className="mt-2 w-full" onClick={onClose}>
              重新选择
            </Button>
          </div>
        ) : (
          <>
            <div className="mt-5 flex flex-col items-center">
              <div className="flex h-[248px] w-[248px] items-center justify-center rounded-lg border border-slate-200 bg-white">
                {qrImage ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={qrImage}
                    alt={`${channelLabel}个人收款码`}
                    className="h-[240px] w-[240px] object-contain"
                  />
                ) : qr ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={qr}
                    alt={`${channelLabel}支付二维码`}
                    className="h-[240px] w-[240px]"
                  />
                ) : (
                  <span className="text-[12px] text-slate-400">二维码生成中…</span>
                )}
              </div>
              <p className="mt-3 text-[11px] text-slate-400">
                请使用{channelLabel}扫一扫完成支付 · 剩余 {remaining}
              </p>
              <p className="mt-1 text-[10px] text-slate-300">
                订单号 {order.outTradeNo}
              </p>
              {provider === "qrnotify" ? (
                <p className="mt-3 w-full rounded-md bg-slate-50 px-3 py-2 text-[10px] leading-relaxed text-slate-500">
                  个人收款码通道：请严格按 {formatAmount(order.amountFen)} 支付，
                  金额尾数用于自动核销；多付或少付都不会自动开通。
                </p>
              ) : null}
              {provider === "mock" ? (
                <div className="mt-4 w-full rounded-lg border border-dashed border-amber-300 bg-amber-50 p-3">
                  <p className="text-[11px] text-amber-700">
                    本地 mock 模式，不会产生真实扣款。
                  </p>
                  <Button
                    variant="primary"
                    className="mt-2 w-full"
                    disabled={busy}
                    onClick={() => void mockPay()}
                  >
                    {busy ? "处理中…" : "模拟支付成功"}
                  </Button>
                </div>
              ) : null}
            </div>

            {error ? (
              <p className="mt-3 rounded-md bg-red-50 px-3 py-2 text-[11px] text-red-600">
                {error}
              </p>
            ) : null}

            <p className="mt-4 text-center text-[10px] leading-relaxed text-slate-400">
              支付成功后立即生效；到期不自动续费。
              如需退款请联系客服，已使用导出不支持退款。
            </p>
          </>
        )}
      </div>
    </div>,
    document.body,
  );
}

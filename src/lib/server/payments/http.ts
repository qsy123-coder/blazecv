import { EpayApiError, EpayConfigError, EpayNotifyError } from "./epay";
import { LtzfApiError, LtzfConfigError, LtzfNotifyError } from "./ltzf";
import { OrderError } from "./orders";
import { PayjsApiError, PayjsConfigError, PayjsNotifyError } from "./payjs";
import {
  PingppApiError,
  PingppConfigError,
  PingppWebhookError,
} from "./pingpp";
import { PayConfigError, PayDisabledError } from "./provider";
import {
  QrNotifyApiError,
  QrNotifyAuthError,
  QrNotifyConfigError,
  QrNotifyPayloadError,
} from "./qrnotify";
import { WechatApiError, WechatConfigError, WechatNotifyError } from "./wechat";
import { XunhuApiError, XunhuConfigError, XunhuNotifyError } from "./xunhu";

export function payErrorResponse(error: unknown): Response {
  if (error instanceof PayDisabledError) {
    return Response.json({ error: "支付暂未开通" }, { status: 503 });
  }
  if (
    error instanceof PayConfigError ||
    error instanceof WechatConfigError ||
    error instanceof PingppConfigError ||
    error instanceof EpayConfigError ||
    error instanceof PayjsConfigError ||
    error instanceof XunhuConfigError ||
    error instanceof LtzfConfigError ||
    error instanceof QrNotifyConfigError
  ) {
    return Response.json({ error: "支付通道尚未配置完成" }, { status: 503 });
  }
  if (error instanceof OrderError) {
    return Response.json({ error: error.message, code: error.code }, { status: error.status });
  }
  if (
    error instanceof WechatNotifyError ||
    error instanceof PingppWebhookError ||
    error instanceof EpayNotifyError ||
    error instanceof PayjsNotifyError ||
    error instanceof XunhuNotifyError ||
    error instanceof LtzfNotifyError ||
    error instanceof QrNotifyAuthError
  ) {
    return Response.json({ code: "FAIL", message: "回调校验失败" }, { status: 401 });
  }
  if (error instanceof QrNotifyPayloadError) {
    return Response.json(
      { code: "FAIL", message: error.message },
      { status: 400 },
    );
  }
  if (
    error instanceof WechatApiError ||
    error instanceof PingppApiError ||
    error instanceof EpayApiError ||
    error instanceof PayjsApiError ||
    error instanceof XunhuApiError ||
    error instanceof LtzfApiError ||
    error instanceof QrNotifyApiError
  ) {
    return Response.json(
      { error: "支付通道暂时不可用，请稍后重试" },
      { status: 502 },
    );
  }
  return Response.json({ error: "支付服务暂时不可用" }, { status: 500 });
}

export function sameOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return true;

  let originUrl: URL;
  try {
    originUrl = new URL(origin);
  } catch {
    return false;
  }
  if (originUrl.protocol !== "http:" && originUrl.protocol !== "https:") return false;

  // Next behind `next start` / a reverse proxy may normalise request.url to
  // localhost while the browser connected via 127.0.0.1 or the public host, so
  // compare hosts from the Host header, X-Forwarded-Host and configured site.
  const allowedHosts = new Set<string>();
  for (const value of [
    request.headers.get("host"),
    request.headers.get("x-forwarded-host"),
    new URL(request.url).host,
  ]) {
    if (value) allowedHosts.add(value.split(",")[0].trim());
  }
  const site = process.env.NEXT_PUBLIC_SITE_URL;
  if (site) {
    try {
      allowedHosts.add(new URL(site).host);
    } catch {
      /* invalid config, ignore */
    }
  }
  return allowedHosts.has(originUrl.host);
}

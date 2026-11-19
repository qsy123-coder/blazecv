import {
  isPayChannel,
  isPayProviderId,
  type PayChannel,
  type PayProviderId,
} from "../../pay-channels";
import { EpayProvider, epayMissingConfig } from "./epay";
import { LtzfProvider, ltzfMissingConfig } from "./ltzf";
import { mockProvider } from "./mock";
import { PayjsProvider, payjsMissingConfig } from "./payjs";
import { PingppProvider, pingppMissingConfig } from "./pingpp";
import {
  QrNotifyProvider,
  qrNotifyChannelPayload,
  qrNotifyMissingConfig,
} from "./qrnotify";
import {
  WechatPayProvider,
  wechatMissingConfig,
} from "./wechat";
import { XunhuProvider, xunhuMissingConfig } from "./xunhu";

export type ProviderId = PayProviderId;
export type { PayChannel };
export { isPayChannel };

export interface NativeOrderInput {
  outTradeNo: string;
  description: string;
  amountFen: number;
  expiresAt: Date;
  attach?: string;
  channel: PayChannel;
  /** 客户端 IP；Ping++ 必填，微信忽略。 */
  clientIp?: string;
}

export interface NativeOrderResult {
  codeUrl: string;
  providerTradeNo?: string;
}

export type NativeOrderState = "pending" | "paid" | "closed" | "unknown";

export interface OrderQueryResult {
  state: NativeOrderState;
  providerTradeNo?: string;
  amountFen?: number;
}

export interface RefundInput {
  outTradeNo: string;
  /** Ping++ 需要 charge id；微信忽略。 */
  providerTradeNo?: string | null;
  outRefundNo: string;
  refundFen: number;
  totalFen: number;
  reason: string;
}

export interface RefundResult {
  refundId: string;
  state: string;
}

export interface PayProvider {
  id: ProviderId;
  /** 服务商模式下返回 sub_mchid；直连/mock 返回 null。 */
  subMerchantId?(): string | null;
  /**
   * 实际应付金额（分）。免签通道用唯一尾数区分同时段订单；
   * 其他通道不实现时按标价。
   */
  payableAmountFen?(baseFen: number, outTradeNo: string): number;
  createNativeOrder(input: NativeOrderInput): Promise<NativeOrderResult>;
  queryOrder(
    outTradeNo: string,
    providerTradeNo?: string | null,
  ): Promise<OrderQueryResult>;
  closeOrder(outTradeNo: string): Promise<void>;
  refund(input: RefundInput): Promise<RefundResult>;
}

export class PayDisabledError extends Error {
  constructor() {
    super("支付未开启");
    this.name = "PayDisabledError";
  }
}

export class PayConfigError extends Error {
  readonly missing: string[];

  constructor(missing: string[]) {
    super(`支付配置不完整：${missing.join(", ")}`);
    this.name = "PayConfigError";
    this.missing = missing;
  }
}

export function payEnabled(): boolean {
  return process.env.PAY_ENABLED === "true";
}

export function activeProviderId(): ProviderId {
  const value = process.env.PAY_PROVIDER;
  return isPayProviderId(value) ? value : "wechat";
}

function missingConfig(id: ProviderId): string[] {
  if (id === "mock") return [];
  if (id === "wechat") return wechatMissingConfig();
  if (id === "pingpp") return pingppMissingConfig();
  if (id === "epay") return epayMissingConfig();
  if (id === "payjs") return payjsMissingConfig();
  if (id === "xunhu") return xunhuMissingConfig();
  if (id === "ltzf") return ltzfMissingConfig();
  return qrNotifyMissingConfig();
}

/** 通道是否真正可用（mock 永远可用；真实通道需要完整配置）。 */
export function providerReady(): boolean {
  if (!payEnabled()) return false;
  return missingConfig(activeProviderId()).length === 0;
}

/** 当前通道配置下可用的支付方式。 */
export function availableChannels(): PayChannel[] {
  if (!payEnabled()) return [];
  const id = activeProviderId();
  if (missingConfig(id).length > 0) return [];
  if (id === "mock") return ["wechat", "alipay"];
  if (id === "pingpp") {
    const channels: PayChannel[] = [];
    if (process.env.PINGPP_WECHAT_ENABLED !== "false") channels.push("wechat");
    if (process.env.PINGPP_ALIPAY_ENABLED !== "false") channels.push("alipay");
    return channels;
  }
  if (id === "epay") {
    return process.env.EPAY_ALIPAY_ENABLED === "true"
      ? ["wechat", "alipay"]
      : ["wechat"];
  }
  if (id === "payjs") return ["wechat"];
  if (id === "ltzf") return ["wechat"];
  if (id === "xunhu") {
    return process.env.XUNHU_ALIPAY_ENABLED === "true"
      ? ["wechat", "alipay"]
      : ["wechat"];
  }
  if (id === "qrnotify") {
    const channels: PayChannel[] = [];
    if (qrNotifyChannelPayload("wechat")) channels.push("wechat");
    if (
      qrNotifyChannelPayload("alipay") &&
      process.env.QR_NOTIFY_ALIPAY_ENABLED !== "false"
    ) {
      channels.push("alipay");
    }
    return channels;
  }
  return wechatMissingConfig().length === 0 ? ["wechat"] : [];
}

export function getPayProvider(): PayProvider {
  if (!payEnabled()) throw new PayDisabledError();
  const id = activeProviderId();
  if (id === "mock") return mockProvider;
  if (id === "pingpp") {
    const missing = pingppMissingConfig();
    if (missing.length > 0) throw new PayConfigError(missing);
    return new PingppProvider();
  }
  if (id === "epay") {
    const missing = epayMissingConfig();
    if (missing.length > 0) throw new PayConfigError(missing);
    return new EpayProvider();
  }
  if (id === "payjs") {
    const missing = payjsMissingConfig();
    if (missing.length > 0) throw new PayConfigError(missing);
    return new PayjsProvider();
  }
  if (id === "xunhu") {
    const missing = xunhuMissingConfig();
    if (missing.length > 0) throw new PayConfigError(missing);
    return new XunhuProvider();
  }
  if (id === "ltzf") {
    const missing = ltzfMissingConfig();
    if (missing.length > 0) throw new PayConfigError(missing);
    return new LtzfProvider();
  }
  if (id === "qrnotify") {
    const missing = qrNotifyMissingConfig();
    if (missing.length > 0) throw new PayConfigError(missing);
    return new QrNotifyProvider();
  }
  const missing = wechatMissingConfig();
  if (missing.length > 0) throw new PayConfigError(missing);
  return new WechatPayProvider();
}

export type PayChannel = "wechat" | "alipay";

/**
 * 支付通道实现。除官方微信 / Ping++ 外，第三方个人聚合与免签通道：
 * - epay：易支付（彩虹易支付）协议
 * - payjs：PayJS Native
 * - xunhu：虎皮椒（XunhuPay）
 * - qrnotify：个人收款码监听通知（免签，自建回调）
 */
export type PayProviderId =
  | "mock"
  | "wechat"
  | "pingpp"
  | "epay"
  | "payjs"
  | "xunhu"
  | "ltzf"
  | "qrnotify";

export const PAY_CHANNEL_LABELS: Record<PayChannel, string> = {
  wechat: "微信支付",
  alipay: "支付宝",
};

export function isPayProviderId(value: unknown): value is PayProviderId {
  return (
    value === "mock" ||
    value === "wechat" ||
    value === "pingpp" ||
    value === "epay" ||
    value === "payjs" ||
    value === "xunhu" ||
    value === "ltzf" ||
    value === "qrnotify"
  );
}

export function isPayChannel(value: unknown): value is PayChannel {
  return value === "wechat" || value === "alipay";
}

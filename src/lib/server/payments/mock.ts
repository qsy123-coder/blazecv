import type {
  NativeOrderInput,
  NativeOrderResult,
  OrderQueryResult,
  PayProvider,
  RefundInput,
  RefundResult,
} from "./provider";

/**
 * Local-only provider. It never contacts WeChat; "payment" is completed through
 * /api/pay/orders/:id/mock-pay, which calls the same fulfillment path as a real
 * callback. The route only exists when PAY_PROVIDER=mock.
 */
export const mockProvider: PayProvider = {
  id: "mock",

  subMerchantId(): string | null {
    return null;
  },

  async createNativeOrder(input: NativeOrderInput): Promise<NativeOrderResult> {
    return {
      codeUrl: `mock://blazecv/${input.outTradeNo}?channel=${input.channel}`,
    };
  },

  async queryOrder(): Promise<OrderQueryResult> {
    // The order table is the source of truth in mock mode.
    return { state: "unknown" };
  },

  async closeOrder(): Promise<void> {
    /* nothing to close */
  },

  async refund(input: RefundInput): Promise<RefundResult> {
    return {
      refundId: `mock-refund-${input.outRefundNo}`,
      state: "SUCCESS",
    };
  },
};

export const PAYMENT_INFO = {
  businessName: process.env.NEXT_PUBLIC_BUSINESS_NAME || "经营主体待填写",
  icp: process.env.NEXT_PUBLIC_ICP || "",
  supportEmail: process.env.NEXT_PUBLIC_SUPPORT_EMAIL || "support@aetouban.cn",
  refundWindowDays: 7,
} as const;

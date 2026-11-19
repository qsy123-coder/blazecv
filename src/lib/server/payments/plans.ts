export type PlanId = "month" | "year";

export interface Plan {
  id: PlanId;
  title: string;
  /** 金额单位：分 */
  amountFen: number;
  /** 会员时长（天） */
  days: number;
  priceLabel: string;
}

export const PLANS: Record<PlanId, Plan> = {
  month: {
    id: "month",
    title: "月卡会员",
    amountFen: 990,
    days: 30,
    priceLabel: "¥9.9",
  },
  year: {
    id: "year",
    title: "年卡会员",
    amountFen: 6800,
    days: 365,
    priceLabel: "¥68",
  },
};

export const PLAN_IDS = Object.keys(PLANS) as PlanId[];

export function isPlanId(value: unknown): value is PlanId {
  return value === "month" || value === "year";
}

export function getPlan(id: string): Plan | null {
  return isPlanId(id) ? PLANS[id] : null;
}

export function listPlans(): Plan[] {
  return PLAN_IDS.map((id) => PLANS[id]);
}

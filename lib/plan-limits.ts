import type { PlanName } from "@/lib/types";

export type PlanLimit = number | null;

export const PLAN_LIMITS: Record<PlanName, PlanLimit> = {
  free:    100,
  starter: 500,
  growth:  2000,
  scale:   null,
};

export function getPlanLimit(planName: PlanName): PlanLimit {
  return PLAN_LIMITS[planName];
}

export function formatPlanLimit(limit: PlanLimit): string {
  return limit === null ? "Unlimited" : limit.toLocaleString();
}

/**
 * Map a Stripe price ID (from env vars) to our internal plan name.
 * Returns "free" for any unknown price ID.
 */
export function getPlanFromPriceId(priceId: string): PlanName {
  if (priceId && priceId === process.env.STRIPE_STARTER_PRICE_ID) return "starter";
  if (priceId && priceId === process.env.STRIPE_GROWTH_PRICE_ID)  return "growth";
  if (priceId && priceId === process.env.STRIPE_SCALE_PRICE_ID)   return "scale";
  return "free";
}

/** Stripe price ID for a given plan name. Returns undefined for "free" (no Stripe price). */
export function getPriceIdForPlan(planName: PlanName): string | undefined {
  switch (planName) {
    case "starter": return process.env.STRIPE_STARTER_PRICE_ID;
    case "growth":  return process.env.STRIPE_GROWTH_PRICE_ID;
    case "scale":   return process.env.STRIPE_SCALE_PRICE_ID;
    default:        return undefined;
  }
}

export const PLAN_DISPLAY: Record<PlanName, { label: string; price: string; description: string }> = {
  free:    { label: "Free",    price: "$0/mo",    description: "Up to 100 registrants/day" },
  starter: { label: "Starter", price: "$29/mo",   description: "Up to 500 registrants/day" },
  growth:  { label: "Growth",  price: "$79/mo",   description: "Up to 2,000 registrants/day" },
  scale:   { label: "Scale",   price: "$199/mo",  description: "Unlimited registrants/day" },
};

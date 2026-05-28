import { describe, expect, it } from "vitest";
import { formatPlanLimit, getPlanLimit, PLAN_LIMITS } from "../lib/plan-limits";

describe("plan limits", () => {
  it("uses null as the unlimited scale-plan limit", () => {
    expect(PLAN_LIMITS.scale).toBeNull();
    expect(getPlanLimit("scale")).toBeNull();
    expect(formatPlanLimit(PLAN_LIMITS.scale)).toBe("Unlimited");
  });

  it("keeps capped plans numeric", () => {
    expect(getPlanLimit("free")).toBe(100);
    expect(formatPlanLimit(getPlanLimit("growth"))).toBe("2,000");
  });
});

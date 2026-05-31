"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import type { PlanName } from "@/lib/types";

interface BillingActionsProps {
  stripeCustomerId?: string;
  planName?: Exclude<PlanName, "free">;
  label: string;
  variant?: "default" | "outline" | "secondary";
  action: "checkout" | "portal";
}

export function BillingActionButton({
  stripeCustomerId,
  planName,
  label,
  variant = "default",
  action,
}: BillingActionsProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");

  const handleClick = async () => {
    setIsLoading(true);
    setError("");

    try {
      const endpoint =
        action === "checkout"
          ? "/api/billing/create-checkout"
          : "/api/billing/create-portal";

      const body = action === "checkout" ? { planName } : {};

      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      const data = await res.json();

      if (!res.ok || !data.url) {
        setError(data.error ?? "Something went wrong. Please try again.");
        setIsLoading(false);
        return;
      }

      window.location.href = data.url;
    } catch {
      setError("Something went wrong. Please try again.");
      setIsLoading(false);
    }
  };

  return (
    <div>
      <Button
        variant={variant}
        size="sm"
        onClick={handleClick}
        disabled={isLoading || (action === "portal" && !stripeCustomerId)}
      >
        {isLoading ? "Redirecting..." : label}
      </Button>
      {error && <p className="mt-1 text-xs text-destructive">{error}</p>}
    </div>
  );
}

import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/app-sidebar";
import { SiteHeader } from "@/components/site-header";
import { BillingActionButton } from "@/components/billing-actions";
import { getOrganization } from "@/lib/actions/org.actions";
import { getLotteriesCollection } from "@/lib/mongodb";
import { getTodayDateString } from "@/lib/date";
import { PLAN_DISPLAY, getPriceIdForPlan, PLAN_LIMITS, formatPlanLimit } from "@/lib/plan-limits";
import type { PlanName } from "@/lib/types";

export const dynamic = "force-dynamic";

const PLAN_ORDER: PlanName[] = ["free", "starter", "growth", "scale"];

export default async function BillingPage({
  searchParams,
}: {
  searchParams: Promise<{ success?: string }>;
}) {
  const { userId, orgId, orgRole } = await auth();

  if (!userId) redirect("/sign-in");
  if (!orgId) redirect("/onboarding");
  if (orgRole !== "org:admin") redirect("/dashboard/lottery");

  const org = await getOrganization(orgId);
  if (!org) redirect("/onboarding");

  const { success } = await searchParams;

  // Fetch today's registrant count for usage display
  const today = getTodayDateString(org.timezone);
  const lotteriesCollection = await getLotteriesCollection();
  const todayLottery = await lotteriesCollection.findOne({ orgId, date: today });
  const todayUsage = todayLottery?.registrantCount ?? 0;

  const isPastDue = org.subscriptionStatus === "past_due";
  const isCanceled = org.subscriptionStatus === "canceled";
  const isRestricted = isPastDue || isCanceled;

  return (
    <SidebarProvider
      style={
        {
          "--sidebar-width": "calc(var(--spacing) * 72)",
          "--header-height": "calc(var(--spacing) * 16)",
        } as React.CSSProperties
      }
    >
      <AppSidebar variant="inset" />
      <SidebarInset>
        <SiteHeader title="Billing" />
        <div className="flex flex-1 flex-col">
          <div className="flex flex-col gap-6 p-4 md:p-6">
            {/* Success banner */}
            {success && (
              <div className="rounded-lg bg-green-50 p-4 text-sm text-green-700">
                Your subscription has been updated successfully.
              </div>
            )}

            {/* Past-due warning */}
            {isPastDue && (
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
                <strong>Payment failed.</strong> Your last invoice could not be collected. Please
                update your payment method to restore full access. Lottery draws and settings
                changes are locked until resolved.
              </div>
            )}

            {/* Canceled warning */}
            {isCanceled && (
              <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">
                <strong>Subscription canceled.</strong> Your account is operating on free-tier
                limits. Re-subscribe to restore higher registrant limits.
              </div>
            )}

            {/* Current plan card */}
            <div className="max-w-lg rounded-lg border p-5 space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-medium uppercase text-muted-foreground">Current plan</p>
                  <p className="mt-0.5 text-xl font-semibold capitalize">{org.planName}</p>
                </div>
                <span
                  className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${
                    isRestricted
                      ? "bg-red-100 text-red-700"
                      : "bg-green-100 text-green-700"
                  }`}
                >
                  {org.subscriptionStatus}
                </span>
              </div>

              <div className="text-sm text-muted-foreground space-y-1">
                <p>
                  Daily limit:{" "}
                  <strong>
                    {org.maxRegistrantsPerDay === null
                      ? "Unlimited"
                      : `${org.maxRegistrantsPerDay.toLocaleString()} registrants`}
                  </strong>
                </p>
                <p>
                  Today&apos;s usage:{" "}
                  <strong>
                    {todayUsage.toLocaleString()}
                    {org.maxRegistrantsPerDay !== null &&
                      ` / ${org.maxRegistrantsPerDay.toLocaleString()}`}
                  </strong>
                </p>
              </div>

              {org.stripeCustomerId && (
                <BillingActionButton
                  action="portal"
                  stripeCustomerId={org.stripeCustomerId}
                  label="Manage billing"
                  variant="outline"
                />
              )}
            </div>

            {/* Plan upgrade / downgrade table */}
            <div className="max-w-2xl">
              <h2 className="text-sm font-medium mb-3">Available plans</h2>
              <div className="grid gap-3 sm:grid-cols-2">
                {PLAN_ORDER.map((planName) => {
                  const display = PLAN_DISPLAY[planName];
                  const priceId = getPriceIdForPlan(planName);
                  const isCurrent = org.planName === planName;
                  const limit = PLAN_LIMITS[planName];

                  return (
                    <div
                      key={planName}
                      className={`rounded-lg border p-4 space-y-2 ${
                        isCurrent ? "border-primary bg-primary/5" : ""
                      }`}
                    >
                      <div className="flex items-baseline justify-between">
                        <p className="font-semibold">{display.label}</p>
                        <p className="text-sm text-muted-foreground">{display.price}</p>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {formatPlanLimit(limit)} registrants/day
                      </p>

                      {isCurrent ? (
                        <span className="inline-block text-xs font-medium text-primary">
                          Current plan
                        </span>
                      ) : planName === "free" ? (
                        <p className="text-xs text-muted-foreground">
                          Cancel subscription via Manage billing to downgrade.
                        </p>
                      ) : priceId ? (
                        <BillingActionButton
                          action="checkout"
                          planName={planName}
                          label={
                            PLAN_ORDER.indexOf(planName) >
                            PLAN_ORDER.indexOf(org.planName)
                              ? "Upgrade"
                              : "Downgrade"
                          }
                          variant={
                            PLAN_ORDER.indexOf(planName) >
                            PLAN_ORDER.indexOf(org.planName)
                              ? "default"
                              : "outline"
                          }
                        />
                      ) : (
                        <p className="text-xs text-muted-foreground">
                          Available after beta.
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}

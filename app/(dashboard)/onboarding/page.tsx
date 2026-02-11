import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { getOrganization, createOrganization } from "@/lib/actions/org.actions";
import { OnboardingForm } from "@/components/onboarding-form";

export default async function OnboardingPage() {
  const { userId, orgId, orgSlug } = await auth();

  if (!userId || !orgId) redirect("/sign-in");

  // If org document already exists, skip onboarding
  const existing = await getOrganization(orgId);
  if (existing) redirect("/dashboard/lottery");

  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-background px-4">
      <div className="w-full max-w-md space-y-8">
        <div className="text-center">
          <h1 className="text-2xl font-bold">Set up your organization</h1>
          <p className="mt-2 text-muted-foreground">
            Configure your lottery settings to get started.
          </p>
        </div>
        <OnboardingForm
          clerkOrgId={orgId}
          defaultSlug={orgSlug ?? ""}
        />
      </div>
    </main>
  );
}

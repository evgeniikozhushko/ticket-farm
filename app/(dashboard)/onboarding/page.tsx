import { CreateOrganization } from "@clerk/nextjs";
import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { getOrganization } from "@/lib/actions/org.actions";
import { OnboardingForm } from "@/components/onboarding-form";

export default async function OnboardingPage() {
  const { userId, orgId, orgSlug } = await auth();

  if (!userId) redirect("/sign-in");

  if (!orgId) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center bg-background px-4">
        <div className="w-full max-w-md space-y-6 text-center">
          <div className="space-y-2">
            <h1 className="text-2xl font-bold">Create your organization</h1>
            <p className="text-muted-foreground">
              Your account is signed in, but it is not attached to an organization yet.
            </p>
          </div>
          <div className="flex justify-center">
            <CreateOrganization
              afterCreateOrganizationUrl="/onboarding"
              skipInvitationScreen
            />
          </div>
        </div>
      </main>
    );
  }

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
          defaultSlug={orgSlug ?? ""}
        />
      </div>
    </main>
  );
}

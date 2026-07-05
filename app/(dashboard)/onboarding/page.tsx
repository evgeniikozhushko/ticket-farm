import { CreateOrganization } from "@clerk/nextjs";
import { redirect } from "next/navigation";
import { ensureOrganizationDocument } from "@/lib/org-setup";
import { OnboardingForm } from "@/components/onboarding-form";

export default async function OnboardingPage() {
  const result = await ensureOrganizationDocument();

  if (result.status === "ok") {
    redirect("/dashboard/lottery");
  }

  if (result.status === "needs-clerk-org") {
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
          defaultSlug={result.defaultSlug}
          initialError={result.error}
        />
      </div>
    </main>
  );
}

import { notFound, redirect } from "next/navigation";
import { getOrgBySlug } from "@/lib/org-cache";
import { RegistrationForm } from "@/components/registration-form";
import { getTodayDateString } from "@/lib/date";
import { DEFAULT_PICKUP_TIME } from "@/lib/pickup";

export default async function OrgRegistrationPage({
  params,
}: {
  params: Promise<{ orgSlug: string }>;
}) {
  const { orgSlug } = await params;
  const canonicalSlug = orgSlug.toLowerCase();

  if (orgSlug !== canonicalSlug) redirect(`/${canonicalSlug}`);

  const org = await getOrgBySlug(orgSlug);

  if (!org) notFound();

  const today = getTodayDateString(org.timezone);

  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-background px-4">
      <div className="w-full max-w-md space-y-8">
        <div className="text-center">
          <h1 className="text-3xl font-bold tracking-tight">{org.name}</h1>
          <p className="mt-2 text-muted-foreground">{today} Daily Lottery</p>
        </div>
        <RegistrationForm
          orgSlug={orgSlug}
          pickupTime={org.pickupTime ?? DEFAULT_PICKUP_TIME}
        />
        <p className="text-center text-sm text-muted-foreground">
          <a href={`/${orgSlug}/winners`} className="underline underline-offset-4 hover:text-foreground">
            View today&apos;s winners
          </a>
        </p>
      </div>
    </main>
  );
}

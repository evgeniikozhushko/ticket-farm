import { SignUp } from "@clerk/nextjs";
import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { getAuthenticatedOrgHomePath } from "@/lib/org-setup";

export default async function SignUpPage() {
  const { userId, orgId } = await auth();

  if (userId) {
    redirect(await getAuthenticatedOrgHomePath(orgId));
  }

  return (
    <div className="flex min-h-svh items-start justify-center px-4 py-8 sm:items-center sm:py-12">
      <SignUp
        forceRedirectUrl="/onboarding"
        fallbackRedirectUrl="/onboarding"
        signInUrl="/sign-in"
      />
    </div>
  );
}

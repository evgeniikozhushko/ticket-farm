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
    <div className="flex min-h-screen items-center justify-center">
      <SignUp
        forceRedirectUrl="/onboarding"
        fallbackRedirectUrl="/onboarding"
        signInUrl="/sign-in"
      />
    </div>
  );
}

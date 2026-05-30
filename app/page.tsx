import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";

export default async function RootPage() {
  const { userId, orgId } = await auth();

  if (!userId) {
    return (
      <main className="min-h-screen bg-background">
        <section className="flex min-h-screen items-center px-6 py-16">
          <div className="mx-auto flex w-full max-w-5xl flex-col gap-8">
            <div className="max-w-3xl space-y-5">
              <p className="text-sm font-medium uppercase tracking-wide text-muted-foreground">
                Ticket Farm
              </p>
              <h1 className="text-4xl font-semibold tracking-tight text-foreground sm:text-5xl">
                Daily lottery and ticket pickup tools for community organizations.
              </h1>
              <p className="max-w-2xl text-lg text-muted-foreground">
                Run public signups, draw winners, email tickets, and manage pickup from one
                multi-tenant dashboard.
              </p>
            </div>
            <div className="flex flex-col gap-3 sm:flex-row">
              <Button asChild size="lg">
                <Link href="/sign-up">Start an organization</Link>
              </Button>
              <Button asChild size="lg" variant="outline">
                <Link href="/about">About Ticket Farm</Link>
              </Button>
            </div>
          </div>
        </section>
      </main>
    );
  }

  if (!orgId) redirect("/onboarding");
  redirect("/dashboard/lottery");
}

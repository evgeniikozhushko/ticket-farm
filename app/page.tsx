import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { getAuthenticatedOrgHomePath } from "@/lib/org-setup";

export default async function RootPage() {
  const { userId, orgId } = await auth();

  if (!userId) {
    return (
      <main className="min-h-screen bg-background">
        <section className="flex min-h-screen flex-col px-6 py-16">
          <div className="mx-auto flex w-full max-w-5xl flex-1 flex-col justify-center gap-8">
            <div className="max-w-3xl space-y-5">
              <p className="text-sm font-medium uppercase tracking-wide text-muted-foreground">
                Ticket Farm · Private Beta
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
              <Button asChild size="lg" variant="secondary">
                <Link href="/sign-in">Sign in</Link>
              </Button>
              <Button asChild size="lg" variant="outline">
                <Link href="/about">About Ticket Farm</Link>
              </Button>
            </div>
          </div>
          <footer className="mx-auto mt-12 flex w-full max-w-5xl flex-wrap items-center gap-x-6 gap-y-2 text-sm text-muted-foreground">
            <Link href="/privacy" className="hover:text-foreground">
              Privacy
            </Link>
            <Link href="/terms" className="hover:text-foreground">
              Terms
            </Link>
            <a href="mailto:hello@ticketfarm.ca" className="hover:text-foreground">
              hello@ticketfarm.ca
            </a>
          </footer>
        </section>
      </main>
    );
  }

  redirect(await getAuthenticatedOrgHomePath(orgId));
}

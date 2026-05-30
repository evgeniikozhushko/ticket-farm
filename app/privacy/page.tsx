import Link from "next/link";

export const metadata = {
  title: "Privacy — Ticket Farm",
};

export default function PrivacyPage() {
  return (
    <main className="min-h-screen bg-background px-6 py-16">
      <article className="mx-auto flex w-full max-w-3xl flex-col gap-6">
        <p className="text-sm font-medium uppercase tracking-wide text-muted-foreground">
          Privacy
        </p>
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
          Privacy notice
        </h1>
        <p className="text-sm text-muted-foreground">
          Last updated: May 2026. Ticket Farm is in private beta; this notice may change
          as the product matures.
        </p>

        <section className="space-y-3">
          <h2 className="text-xl font-semibold">What we collect</h2>
          <p className="text-muted-foreground">
            <strong className="text-foreground">Account data.</strong> When you create an
            account, we collect your email address, name, and any organization details
            you provide. Authentication is handled by Clerk; their privacy notice covers
            credential storage.
          </p>
          <p className="text-muted-foreground">
            <strong className="text-foreground">Lottery registration data.</strong> When
            someone enters an organization&apos;s public lottery, we collect the
            information shown on that org&apos;s registration form — typically name,
            email, and contact details. This data belongs to the organization that
            collected it.
          </p>
          <p className="text-muted-foreground">
            <strong className="text-foreground">Operational data.</strong> Standard
            request logs (IP, user agent, timestamps) are retained for security and
            debugging.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-semibold">How we use email</h2>
          <p className="text-muted-foreground">
            We send transactional emails only: account verification, winner
            notifications, and ticket delivery. We do not send marketing email from
            Ticket Farm. Organizations may contact their own registrants through their
            own channels; that&apos;s not handled by us.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-semibold">Who can see your data</h2>
          <p className="text-muted-foreground">
            Each organization is isolated. Admins of an organization can see their own
            org&apos;s registrants and tickets — nothing from other orgs. Ticket Farm
            staff can access data when necessary for support or to investigate abuse.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-semibold">Subprocessors</h2>
          <p className="text-muted-foreground">
            We rely on third parties for hosting (Vercel), database (MongoDB Atlas),
            authentication (Clerk), email delivery (Resend), background jobs (Inngest),
            and billing (Stripe — currently in test mode during beta). Each handles data
            under their own terms.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-semibold">Contact</h2>
          <p className="text-muted-foreground">
            Questions, data requests, or deletion requests — email{" "}
            <a href="mailto:hello@ticketfarm.ca" className="underline underline-offset-4">
              hello@ticketfarm.ca
            </a>
            .
          </p>
        </section>

        <div className="pt-4 text-sm">
          <Link
            href="/"
            className="underline underline-offset-4 text-muted-foreground hover:text-foreground"
          >
            Back to home
          </Link>
        </div>
      </article>
    </main>
  );
}

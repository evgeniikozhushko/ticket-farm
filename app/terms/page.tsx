import Link from "next/link";

export const metadata = {
  title: "Terms — Ticket Farm",
};

export default function TermsPage() {
  return (
    <main className="min-h-screen bg-background px-6 py-16">
      <article className="mx-auto flex w-full max-w-3xl flex-col gap-6">
        <p className="text-sm font-medium uppercase tracking-wide text-muted-foreground">
          Terms
        </p>
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
          Beta terms of service
        </h1>
        <p className="text-sm text-muted-foreground">
          Last updated: May 2026. Ticket Farm is in private beta; these terms govern
          beta use and will be superseded when the platform moves to general
          availability.
        </p>

        <section className="space-y-3">
          <h2 className="text-xl font-semibold">Beta status</h2>
          <p className="text-muted-foreground">
            Ticket Farm is a beta service. Features may change, break, or be removed
            without notice. Uptime is not guaranteed during beta. We will give
            reasonable notice before any disruptive change when we can.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-semibold">Your organization, your data</h2>
          <p className="text-muted-foreground">
            You retain ownership of data your organization collects through the
            platform — including registrant information and lottery results. You are
            responsible for handling that data in compliance with applicable law,
            including obtaining any necessary consent from your registrants.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-semibold">Acceptable use</h2>
          <p className="text-muted-foreground">
            Don&apos;t use Ticket Farm to run illegal lotteries, deceive registrants,
            scrape or abuse other organizations&apos; data, attempt to bypass the
            platform&apos;s rate limits or security, or send unsolicited marketing
            email through our infrastructure. We may suspend organizations that violate
            these rules.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-semibold">Billing during beta</h2>
          <p className="text-muted-foreground">
            Paid plans are not available during beta. Organizations operate on a free
            tier with a default daily registrant cap. If your organization needs a
            higher cap, contact us and we can raise it manually for the duration of the
            beta.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-semibold">No warranty, limited liability</h2>
          <p className="text-muted-foreground">
            The beta service is provided &quot;as is&quot; without warranties of any
            kind. To the maximum extent permitted by law, Ticket Farm is not liable for
            indirect, incidental, or consequential damages arising from beta use,
            including loss of data, lost revenue from cancelled draws, or downtime.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-semibold">Contact</h2>
          <p className="text-muted-foreground">
            Questions about these terms — email{" "}
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

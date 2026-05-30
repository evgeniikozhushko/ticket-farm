import Link from "next/link";

export const metadata = {
  title: "About — Ticket Farm",
};

export default function AboutPage() {
  return (
    <main className="min-h-screen bg-background px-6 py-16">
      <article className="mx-auto flex w-full max-w-3xl flex-col gap-6">
        <p className="text-sm font-medium uppercase tracking-wide text-muted-foreground">
          About · Private Beta
        </p>
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
          Ticket Farm
        </h1>
        <p className="text-lg text-muted-foreground">
          Ticket Farm is a multi-tenant platform for organizations that run daily
          lotteries. Public visitors register on a branded org page; the platform
          picks winners on a schedule, emails their tickets, and tracks pickup —
          all from one dashboard.
        </p>
        <p className="text-base text-muted-foreground">
          We&apos;re currently in private beta. Organization signup is open and free
          while we polish the platform. Reach us at{" "}
          <a href="mailto:hello@ticketfarm.ca" className="underline underline-offset-4">
            hello@ticketfarm.ca
          </a>
          .
        </p>
        <div className="pt-4 text-sm">
          <Link href="/" className="underline underline-offset-4 text-muted-foreground hover:text-foreground">
            Back to home
          </Link>
        </div>
      </article>
    </main>
  );
}

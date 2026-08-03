import Link from "next/link";
import { Button } from "@/components/ui/button";
import { features } from "@/lib/features";
import FeatureSection from "@/components/feature-section";
import { RegistrationPreview } from "@/components/registration-preview";
import { LotteryDrawPreview } from "@/components/lotterydraw-preview";

export default async function RootPage() {
  return (
    <main className="min-h-screen bg-background">

      {/* Hero */}
      <section className="flex min-h-[85vh] items-center px-6 py-16">
        <div className="mx-auto w-full max-w-5xl">
          <div className="max-w-3xl space-y-5">
            <p className="text-sm font-medium uppercase tracking-wide text-muted-foreground">
              Ticket Farm · Private Beta
            </p>

            <h1 className="text-4xl font-semibold tracking-tight text-foreground sm:text-5xl">
              A complete ticket allocation and pickup platform for community organizations.
            </h1>

            <p className="max-w-2xl text-lg text-muted-foreground">
              Manage public registration, fair winner selection, automatic ticket delivery, and pickup from one simple dashboard.
            </p>
          </div>

          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <Button asChild size="lg">
              <Link href="/sign-up">Start an organization</Link>
            </Button>

            <Button asChild size="lg" variant="secondary">
              <Link href="/sign-in">Sign in</Link>
            </Button>
          </div>
        </div>
      </section>

      {/* About */}
      <div>
        {features.map((feature, index) => (
          <FeatureSection
            key={feature.title}
            {...feature}
            reverse={index % 2 === 1}
            preview={index === 0 ? (
              <RegistrationPreview />
            ) : (index === 1 ? (
              <LotteryDrawPreview />
            ) : undefined)}
          />
        ))}
      </div>

      <footer className="px-6 py-8">
        <div className="mx-auto flex w-full max-w-5xl flex-wrap items-center gap-x-6 gap-y-2 text-sm text-muted-foreground">
          <Link href="/privacy" className="hover:text-foreground">
            Privacy
          </Link>
          <Link href="/terms" className="hover:text-foreground">
            Terms
          </Link>
          <a href="mailto:hello@ticketfarm.ca" className="hover:text-foreground">
            hello@ticketfarm.ca
          </a>
        </div>
      </footer>
    </main>
  );
}

"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createOrganization } from "@/lib/actions/org.actions";

const COMMON_TIMEZONES = [
  "America/Edmonton",
  "America/Vancouver",
  "America/Toronto",
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "Europe/London",
  "Europe/Paris",
  "Australia/Sydney",
  "UTC",
];

export function OnboardingForm({
  clerkOrgId,
  defaultSlug,
}: {
  clerkOrgId: string;
  defaultSlug: string;
}) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [slug, setSlug] = useState(defaultSlug);
  const [timezone, setTimezone] = useState("America/Edmonton");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError("");

    try {
      await createOrganization({ clerkOrgId, name, slug, timezone });
      router.push("/dashboard/lottery");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create organization");
      setIsLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="space-y-2">
        <Label htmlFor="name">Organization name</Label>
        <Input
          id="name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Canmore Food Recovery Barn"
          required
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="slug">URL slug</Label>
        <Input
          id="slug"
          value={slug}
          onChange={(e) => setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "-"))}
          placeholder="canmore-food-recovery"
          required
        />
        <p className="text-xs text-muted-foreground">
          Your registration page: ticketfarm.ca/<strong>{slug || "your-slug"}</strong>
        </p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="timezone">Timezone</Label>
        <select
          id="timezone"
          value={timezone}
          onChange={(e) => setTimezone(e.target.value)}
          className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
        >
          {COMMON_TIMEZONES.map((tz) => (
            <option key={tz} value={tz}>{tz}</option>
          ))}
        </select>
      </div>

      {error && (
        <div className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive">{error}</div>
      )}

      <Button type="submit" className="w-full" disabled={isLoading}>
        {isLoading ? "Setting up..." : "Get started"}
      </Button>
    </form>
  );
}

"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { updateOrganizationSettings } from "@/lib/actions/org.actions";
import type { SerializedOrganization } from "@/lib/types";

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

export function OrgSettingsForm({ org }: { org: SerializedOrganization }) {
  const [name, setName] = useState(org.name);
  const [slug, setSlug] = useState(org.slug);
  const [timezone, setTimezone] = useState(org.timezone);
  const [publicPageEnabled, setPublicPageEnabled] = useState(
    org.publicPageEnabled
  );
  const [emailFromName, setEmailFromName] = useState(org.emailFromName);
  const [emailFromAddress, setEmailFromAddress] = useState(
    org.emailFromAddress
  );

  const [isLoading, setIsLoading] = useState(false);
  const [message, setMessage] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setMessage(null);

    const result = await updateOrganizationSettings({
      name,
      slug,
      timezone,
      publicPageEnabled,
      emailFromName,
      emailFromAddress,
    });

    setIsLoading(false);

    if (result.success) {
      setMessage({ type: "success", text: "Settings saved." });
    } else {
      setMessage({
        type: "error",
        text: result.error ?? "Failed to save settings.",
      });
    }
  };

  const slugChanged = slug !== org.slug;

  return (
    <form onSubmit={handleSubmit} className="space-y-6 max-w-lg">
      {/* Organization name */}
      <div className="space-y-2">
        <Label htmlFor="name">Organization name</Label>
        <Input
          id="name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
        />
      </div>

      {/* URL slug */}
      <div className="space-y-2">
        <Label htmlFor="slug">URL slug</Label>
        <Input
          id="slug"
          value={slug}
          onChange={(e) =>
            setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "-"))
          }
          required
        />
        <p className="text-xs text-muted-foreground">
          Registration page:{" "}
          <strong>ticketfarm.ca/{slug || "your-slug"}</strong>
        </p>
        {slugChanged && (
          <p className="text-xs text-amber-600">
            Slug changes take up to 5 minutes to fully propagate across all
            servers.
          </p>
        )}
      </div>

      {/* Timezone */}
      <div className="space-y-2">
        <Label htmlFor="timezone">Timezone</Label>
        <select
          id="timezone"
          value={timezone}
          onChange={(e) => setTimezone(e.target.value)}
          className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
        >
          {COMMON_TIMEZONES.map((tz) => (
            <option key={tz} value={tz}>
              {tz}
            </option>
          ))}
        </select>
      </div>

      {/* Public page toggle */}
      <div className="flex items-center gap-3">
        <input
          type="checkbox"
          id="publicPageEnabled"
          checked={publicPageEnabled}
          onChange={(e) => setPublicPageEnabled(e.target.checked)}
          className="h-4 w-4 rounded border-input"
        />
        <Label htmlFor="publicPageEnabled">
          Enable public registration page
        </Label>
      </div>

      {/* Email branding */}
      <div className="space-y-4 rounded-lg border p-4">
        <p className="text-sm font-medium">Email branding</p>
        <div className="space-y-2">
          <Label htmlFor="emailFromName">Sender name</Label>
          <Input
            id="emailFromName"
            value={emailFromName}
            onChange={(e) => setEmailFromName(e.target.value)}
            placeholder="My Organization"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="emailFromAddress">Sender address</Label>
          <Input
            id="emailFromAddress"
            type="email"
            value={emailFromAddress}
            onChange={(e) => setEmailFromAddress(e.target.value)}
            placeholder="hello@example.com"
          />
          <p className="text-xs text-muted-foreground">
            Must be a verified sender address in Resend.
          </p>
        </div>
      </div>

      {message && (
        <div
          className={`rounded-lg p-3 text-sm ${
            message.type === "success"
              ? "bg-green-50 text-green-700"
              : "bg-destructive/10 text-destructive"
          }`}
        >
          {message.text}
        </div>
      )}

      <Button type="submit" disabled={isLoading}>
        {isLoading ? "Saving..." : "Save settings"}
      </Button>
    </form>
  );
}

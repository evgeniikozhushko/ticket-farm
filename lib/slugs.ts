export const RESERVED_ORG_SLUGS = new Set([
  "dashboard",
  "api",
  "platform",
  "sign-in",
  "sign-up",
  "admin",
  "ticket",
  "privacy",
  "terms",
  "about",
  "winners",
  "onboarding",
  "billing",
]);

export function normalizeOrgSlug(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

export function parseOrgSlug(value: string): string {
  const slug = normalizeOrgSlug(value);

  if (!slug) {
    throw new Error("Slug is required.");
  }

  if (slug.length < 3 || slug.length > 63) {
    throw new Error("Slug must be between 3 and 63 characters.");
  }

  if (!/^[a-z0-9-]+$/.test(slug)) {
    throw new Error("Slug may only contain lowercase letters, numbers, and hyphens.");
  }

  if (RESERVED_ORG_SLUGS.has(slug)) {
    throw new Error("This slug is reserved. Please choose another.");
  }

  return slug;
}

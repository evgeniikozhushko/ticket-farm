/**
 * In-process LRU cache for slug → Organization lookups.
 *
 * Used ONLY by public unauthenticated routes (/[orgSlug], /[orgSlug]/winners).
 * Authenticated dashboard routes use auth().orgId directly — no lookup needed.
 *
 * MULTI-INSTANCE LIMITATION:
 * Each Vercel serverless function instance has its own in-process cache.
 * Slug changes take up to TTL_MS to propagate across all instances.
 * On slug update, call invalidateOrgCache(oldSlug) and invalidateOrgCache(newSlug)
 * to clear the current instance immediately; other instances expire via TTL.
 * Surface this in the settings UI: "Slug changes take up to 5 minutes to fully
 * propagate across all servers."
 */

import type { Organization } from "@/lib/types";
import { getOrganizationsCollection } from "@/lib/mongodb";

const TTL_MS = 5 * 60 * 1000; // 5 minutes
const MAX_SIZE = 500;

interface CacheEntry {
  org: Organization | null; // null = confirmed not found
  expiresAt: number;
}

// Module-level map — survives across requests in the same process
const cache = new Map<string, CacheEntry>();

function evictExpired() {
  const now = Date.now();
  for (const [key, entry] of cache.entries()) {
    if (entry.expiresAt <= now) cache.delete(key);
  }
}

function evictOldest() {
  // Map preserves insertion order; delete the first (oldest) entry
  const firstKey = cache.keys().next().value;
  if (firstKey !== undefined) cache.delete(firstKey);
}

/**
 * Returns the Organization for the given slug, or null if not found.
 * Cache miss → DB read → cache set.
 */
export async function getOrgBySlug(slug: string): Promise<Organization | null> {
  const now = Date.now();
  const hit = cache.get(slug);

  if (hit && hit.expiresAt > now) {
    return hit.org;
  }

  // Cache miss or expired — fetch from DB
  const collection = await getOrganizationsCollection();
  const org = await collection.findOne({ slug, publicPageEnabled: true });

  // Evict stale entries before inserting to respect MAX_SIZE
  evictExpired();
  if (cache.size >= MAX_SIZE) evictOldest();

  cache.set(slug, { org: org ?? null, expiresAt: now + TTL_MS });
  return org ?? null;
}

/**
 * Removes a slug entry from the cache.
 * Call on slug update with both the old and new slug values.
 */
export function invalidateOrgCache(slug: string): void {
  cache.delete(slug);
}

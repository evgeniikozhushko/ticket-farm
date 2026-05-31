import { getDb } from './mongodb';
import type { Document } from 'mongodb';

/**
 * Creates all indexes for Ticket Farm.
 *
 * MIGRATION NOTE (Phase 2):
 * The orgId-leading indexes below replace the old non-scoped indexes.
 * Run this ONLY after scripts/migrate-add-orgid.ts has successfully
 * backfilled orgId on all existing documents.
 *
 * Safe rollout order:
 *   1. Run migrate-add-orgid.ts
 *   2. Run this script (creates new indexes in background, old ones still exist)
 *   3. Deploy app code that reads with orgId filter
 *   4. Drop old indexes via dropOldIndexes() below
 */
export async function setupIndexes() {
  console.log("Setting up database indexes...");

  const db = await getDb();

  // ============================================================
  // REGISTRANTS — orgId-leading
  // ============================================================

  // Primary duplicate guard: one registration per (org, email, day)
  await db.collection('registrants').createIndex(
    { orgId: 1, email: 1, date: 1 },
    { unique: true, name: 'orgId_email_date_unique_idx', background: true }
  );
  console.log("  registrants: { orgId, email, date } unique");

  // Admin list page sort
  await db.collection('registrants').createIndex(
    { orgId: 1, date: 1, enteredAt: 1 },
    { name: 'orgId_date_enteredAt_idx', background: true }
  );
  console.log("  registrants: { orgId, date, enteredAt }");

  // Participants page: grouped email pagination + first/last entry summaries
  await db.collection('registrants').createIndex(
    { orgId: 1, email: 1, enteredAt: 1 },
    { name: 'orgId_email_enteredAt_idx', background: true }
  );
  console.log("  registrants: { orgId, email, enteredAt }");

  // Participants page: org-scoped prefix search by participant name
  await db.collection('registrants').createIndex(
    { orgId: 1, name: 1, email: 1 },
    { name: 'orgId_name_email_idx', background: true }
  );
  console.log("  registrants: { orgId, name, email }");

  // ============================================================
  // LOTTERIES — orgId-leading
  // ============================================================

  // One lottery per (org, day); also serves as draw atomic-lock key
  await db.collection('lotteries').createIndex(
    { orgId: 1, date: 1 },
    { unique: true, name: 'orgId_date_unique_idx', background: true }
  );
  console.log("  lotteries: { orgId, date } unique");

  // ============================================================
  // TICKETS — orgId-leading
  // ============================================================

  // Winners page query + sort
  await db.collection('tickets').createIndex(
    { orgId: 1, date: 1, status: 1, ticketNumber: 1 },
    { name: 'orgId_winners_page_idx', background: true }
  );
  console.log("  tickets: { orgId, date, status, ticketNumber }");

  // Globally unique ticket ID (unchanged — ticketId is already globally unique)
  await db.collection('tickets').createIndex(
    { ticketId: 1 },
    { unique: true, name: 'ticketId_unique_idx', background: true }
  );
  console.log("  tickets: { ticketId } unique");

  // Email lookup per org+day
  await db.collection('tickets').createIndex(
    { orgId: 1, email: 1, date: 1 },
    { name: 'orgId_email_date_idx', background: true }
  );
  console.log("  tickets: { orgId, email, date }");

  // ============================================================
  // ORGANIZATIONS
  // ============================================================

  await db.collection('organizations').createIndex(
    { clerkOrgId: 1 },
    { unique: true, name: 'clerkOrgId_unique_idx', background: true }
  );
  console.log("  organizations: { clerkOrgId } unique");

  await db.collection('organizations').createIndex(
    { slug: 1 },
    { unique: true, name: 'slug_unique_idx', background: true }
  );
  console.log("  organizations: { slug } unique");

  // ============================================================
  // PROCESSED_WEBHOOK_EVENTS — Stripe idempotency
  // ============================================================

  await db.collection('processed_webhook_events').createIndex(
    { stripeEventId: 1 },
    { unique: true, name: 'stripeEventId_unique_idx', background: true }
  );
  console.log("  processed_webhook_events: { stripeEventId } unique");

  // ============================================================
  // EMAIL_DISPATCHES — durable Inngest dispatch outbox
  // ============================================================

  await db.collection('email_dispatches').createIndex(
    { orgId: 1, date: 1, eventName: 1 },
    { unique: true, name: 'orgId_date_eventName_unique_idx', background: true }
  );
  console.log("  email_dispatches: { orgId, date, eventName } unique");

  await db.collection('email_dispatches').createIndex(
    { status: 1, updatedAt: 1 },
    { name: 'status_updatedAt_idx', background: true }
  );
  console.log("  email_dispatches: { status, updatedAt }");

  // ============================================================
  // PUBLIC_REGISTRATION_RATE_LIMITS — anti-abuse counters
  // ============================================================

  await db.collection('public_registration_rate_limits').createIndex(
    { key: 1 },
    { unique: true, name: 'key_unique_idx', background: true }
  );
  console.log("  public_registration_rate_limits: { key } unique");

  await db.collection('public_registration_rate_limits').createIndex(
    { expiresAt: 1 },
    { expireAfterSeconds: 0, name: 'expiresAt_ttl_idx', background: true }
  );
  console.log("  public_registration_rate_limits: { expiresAt } TTL");

  console.log("\nAll indexes created (building in background if new).");
}

/**
 * Drop old pre-orgId indexes after Phase 2 migration is stable.
 * Only run after confirming all queries use orgId-leading indexes.
 */
export async function dropOldIndexes() {
  const db = await getDb();
  const drops = [
    { col: 'registrants', name: 'email_date_unique_idx' },
    { col: 'registrants', name: 'email_date_idx' },
    { col: 'registrants', name: 'date_enteredAt_idx' },
    { col: 'lotteries',   name: 'date_unique_idx' },
    { col: 'tickets',     name: 'winners_page_idx' },
    { col: 'tickets',     name: 'email_date_idx' },
  ];
  for (const { col, name } of drops) {
    try {
      await db.collection(col).dropIndex(name);
      console.log(`Dropped: ${col}.${name}`);
    } catch {
      console.log(`Skip (not found): ${col}.${name}`);
    }
  }
}

/**
 * Lists all existing indexes for verification
 */
export async function listIndexes() {
  const db = await getDb();
  const collections = [
    'registrants',
    'tickets',
    'lotteries',
    'organizations',
    'processed_webhook_events',
    'email_dispatches',
    'public_registration_rate_limits',
  ];
  console.log("\nCurrent Indexes:\n");
  for (const collName of collections) {
    const indexes = await db.collection(collName).indexes();
    console.log(`${collName}:`);
    indexes.forEach((idx) => {
      console.log(`  - ${idx.name}: ${JSON.stringify(idx.key)}`);
    });
    console.log();
  }
}

type RequiredIndex = {
  collection: string;
  name: string;
  key: Record<string, 1 | -1>;
  unique?: boolean;
  expireAfterSeconds?: number;
};

const REQUIRED_DEPLOY_INDEXES: RequiredIndex[] = [
  {
    collection: 'registrants',
    name: 'orgId_email_enteredAt_idx',
    key: { orgId: 1, email: 1, enteredAt: 1 },
  },
  {
    collection: 'registrants',
    name: 'orgId_name_email_idx',
    key: { orgId: 1, name: 1, email: 1 },
  },
  {
    collection: 'processed_webhook_events',
    name: 'stripeEventId_unique_idx',
    key: { stripeEventId: 1 },
    unique: true,
  },
  {
    collection: 'email_dispatches',
    name: 'orgId_date_eventName_unique_idx',
    key: { orgId: 1, date: 1, eventName: 1 },
    unique: true,
  },
  {
    collection: 'email_dispatches',
    name: 'status_updatedAt_idx',
    key: { status: 1, updatedAt: 1 },
  },
  {
    collection: 'public_registration_rate_limits',
    name: 'key_unique_idx',
    key: { key: 1 },
    unique: true,
  },
  {
    collection: 'public_registration_rate_limits',
    name: 'expiresAt_ttl_idx',
    key: { expiresAt: 1 },
    expireAfterSeconds: 0,
  },
];

function keysMatch(actual: Document | undefined, expected: Record<string, 1 | -1>): boolean {
  return JSON.stringify(actual ?? {}) === JSON.stringify(expected);
}

export async function verifyRequiredIndexes(): Promise<void> {
  const db = await getDb();
  let missing = 0;

  console.log("Required deploy indexes:\n");

  for (const required of REQUIRED_DEPLOY_INDEXES) {
    const indexes = await db.collection(required.collection).indexes();
    const found = indexes.find((idx) => idx.name === required.name);
    const ok =
      !!found &&
      keysMatch(found.key, required.key) &&
      (required.unique === undefined || found.unique === required.unique) &&
      (required.expireAfterSeconds === undefined ||
        found.expireAfterSeconds === required.expireAfterSeconds);

    if (ok) {
      console.log(`  [OK] ${required.collection}.${required.name} present`);
    } else {
      missing++;
      console.error(
        `  [MISSING] ${required.collection}.${required.name} missing or mismatched; expected ${JSON.stringify({
          key: required.key,
          unique: required.unique,
          expireAfterSeconds: required.expireAfterSeconds,
        })}`
      );
    }
  }

  if (missing > 0) {
    throw new Error(`${missing} required deploy index check(s) failed.`);
  }

  console.log("\nRequired deploy indexes verified.");
}

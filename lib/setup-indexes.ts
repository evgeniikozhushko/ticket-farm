import { getDb } from './mongodb';

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
  const collections = ['registrants', 'tickets', 'lotteries', 'organizations', 'processed_webhook_events'];
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

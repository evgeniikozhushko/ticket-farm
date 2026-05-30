/**
 * Phase 2 Migration: Backfill orgId on all existing documents.
 *
 * Usage:
 *   SEED_ORG_ID=org_xxx pnpm tsx scripts/migrate-add-orgid.ts
 *
 * Run BEFORE rebuilding indexes with orgId-leading keys.
 * See SAAS_PLAN.md Zero-Downtime Migration Sequence for full rollout order.
 */

import { MongoClient } from "mongodb";
import * as dotenv from "dotenv";

dotenv.config({ path: ".env.local" });

const SEED_ORG_ID = process.env.SEED_ORG_ID;
const MONGODB_URI = process.env.MONGODB_URI!;
const MONGODB_DB_NAME = process.env.MONGODB_DB_NAME!;

if (!SEED_ORG_ID) {
  console.error("Error: SEED_ORG_ID environment variable is required.");
  console.error("Usage: SEED_ORG_ID=org_xxx pnpm tsx scripts/migrate-add-orgid.ts");
  process.exit(1);
}

async function migrate() {
  const client = await MongoClient.connect(MONGODB_URI);
  const db = client.db(MONGODB_DB_NAME);

  console.log(`Backfilling orgId = ${SEED_ORG_ID} on documents without orgId...`);

  const collections = ["registrants", "lotteries", "tickets"] as const;

  for (const collName of collections) {
    const coll = db.collection(collName);

    // Count documents missing orgId
    const missing = await coll.countDocuments({ orgId: { $exists: false } });
    console.log(`  ${collName}: ${missing} documents to update`);

    if (missing > 0) {
      const result = await coll.updateMany(
        { orgId: { $exists: false } },
        { $set: { orgId: SEED_ORG_ID } }
      );
      console.log(`  ${collName}: updated ${result.modifiedCount} documents`);
    }
  }

  const lotteries = db.collection("lotteries");
  const legacyLotteries = await lotteries
    .find({ registrantCount: { $exists: false } }, { projection: { _id: 1, orgId: 1, date: 1 } })
    .toArray();

  console.log(`  lotteries: ${legacyLotteries.length} documents missing registrantCount`);

  for (const lottery of legacyLotteries) {
    const count = await db.collection("registrants").countDocuments({
      orgId: lottery.orgId,
      date: lottery.date,
    });

    await lotteries.updateOne(
      { _id: lottery._id },
      { $set: { registrantCount: count } }
    );
  }

  // Verify: check no documents are missing orgId
  console.log("\nVerification:");
  for (const collName of collections) {
    const remaining = await db.collection(collName).countDocuments({ orgId: { $exists: false } });
    if (remaining > 0) {
      console.error(`  ❌ ${collName}: ${remaining} documents still missing orgId!`);
    } else {
      console.log(`  ✅ ${collName}: all documents have orgId`);
    }
  }

  const missingRegistrantCount = await lotteries.countDocuments({
    registrantCount: { $exists: false },
  });

  if (missingRegistrantCount > 0) {
    console.error(`  ❌ lotteries: ${missingRegistrantCount} documents still missing registrantCount!`);
  } else {
    console.log("  ✅ lotteries: all documents have registrantCount");
  }

  await client.close();
  console.log("\nMigration complete. You can now run lib/setup-indexes.ts to rebuild indexes.");
}

migrate().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});

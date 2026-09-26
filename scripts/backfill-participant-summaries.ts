/**
 * Rebuild participant_summaries from registrants and tickets.
 *
 * Run only during a maintenance window, after creating the summary indexes and
 * before deploying the summary readers. Registration, draws, and redemption
 * must remain paused for the whole rebuild; this script replaces derived data.
 *
 * Usage: pnpm tsx scripts/backfill-participant-summaries.ts
 */
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { MongoClient, type Db } from "mongodb";
import * as dotenv from "dotenv";

export async function backfillParticipantSummaries(db: Db): Promise<number> {
  const summaries = db.collection("participant_summaries");
  const rows = await db.collection("registrants").aggregate([
      { $sort: { orgId: 1, email: 1, enteredAt: 1 } },
      { $group: {
        _id: { orgId: "$orgId", email: "$email" },
        orgId: { $first: "$orgId" }, email: { $first: "$email" },
        firstEnteredAt: { $first: "$enteredAt" }, lastEnteredAt: { $last: "$enteredAt" },
        latestName: { $last: "$name" }, entryCount: { $sum: 1 },
      } },
      { $lookup: { from: "tickets", let: { orgId: "$orgId", email: "$email" }, pipeline: [
        { $match: { $expr: { $and: [{ $eq: ["$orgId", "$$orgId"] }, { $eq: ["$email", "$$email"] }] } } },
        { $group: { _id: null, winCount: { $sum: 1 }, activeTicketCount: { $sum: { $cond: [{ $eq: ["$status", "ACTIVE"] }, 1, 0] } }, checkedInTicketCount: { $sum: { $cond: [{ $eq: ["$status", "CHECKED_IN"] }, 1, 0] } } } },
      ], as: "tickets" } },
      { $set: { ticketCounts: { $first: "$tickets" } } },
      { $project: { _id: 0, orgId: 1, email: 1, firstEnteredAt: 1, lastEnteredAt: 1, latestName: 1, entryCount: 1, normalizedName: { $toLower: { $trim: { input: "$latestName" } } }, winCount: { $ifNull: ["$ticketCounts.winCount", 0] }, activeTicketCount: { $ifNull: ["$ticketCounts.activeTicketCount", 0] }, checkedInTicketCount: { $ifNull: ["$ticketCounts.checkedInTicketCount", 0] } } },
  ]).toArray();
  await summaries.deleteMany({});
  if (rows.length) await summaries.insertMany(rows);
  return rows.length;
}

async function main() {
  dotenv.config({ path: ".env.local" });
  const uri = process.env.MONGODB_URI;
  const dbName = process.env.MONGODB_DB_NAME;
  if (!uri || !dbName) throw new Error("MONGODB_URI and MONGODB_DB_NAME are required.");

  const client = await MongoClient.connect(uri);
  try {
    const count = await backfillParticipantSummaries(client.db(dbName));
    console.log(`Rebuilt ${count} participant summaries.`);
  } finally {
    await client.close();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch((error) => {
    console.error("Participant summary backfill failed:", error);
    process.exit(1);
  });
}

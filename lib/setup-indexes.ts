import { getDb } from './mongodb';

/**
 * Creates all necessary indexes for the Ticket Farm application.
 * Run this once during initial setup or deployment.
 *
 * Indexes improve query performance by allowing MongoDB to quickly
 * find documents without scanning the entire collection.
 */
export async function setupIndexes() {
  console.log("🔧 Setting up database indexes...");

  const db = await getDb();

  // ============================================================
  // REGISTRANTS COLLECTION INDEXES
  // ============================================================

  console.log("  📋 Creating indexes for 'registrants' collection...");

  // Unique index for duplicate checking — prevents concurrent duplicate registrations
  // Query: collection.insertOne({ email, date }) — E11000 on duplicate
  await db.collection('registrants').createIndex(
    { email: 1, date: 1 },
    { unique: true, name: 'email_date_unique_idx' }
  );
  console.log("    ✅ Created: { email: 1, date: 1 } (unique)");

  // Index for admin page queries (used in app/admin/registrants/page.tsx)
  // Query: collection.find({ date }).sort({ enteredAt: 1 })
  await db.collection('registrants').createIndex(
    { date: 1, enteredAt: 1 },
    { name: 'date_enteredAt_idx' }
  );
  console.log("    ✅ Created: { date: 1, enteredAt: 1 }");

  // ============================================================
  // TICKETS COLLECTION INDEXES
  // ============================================================

  console.log("  🎫 Creating indexes for 'tickets' collection...");

  // Index for winners page (used in app/winners/page.tsx)
  // Query: collection.find({ date, status: { $in: [...] } }).sort({ ticketNumber: 1 })
  await db.collection('tickets').createIndex(
    { date: 1, status: 1, ticketNumber: 1 },
    { name: 'winners_page_idx' }
  );
  console.log("    ✅ Created: { date: 1, status: 1, ticketNumber: 1 }");

  // Unique index for ticket ID lookups (ensures no duplicate ticket IDs)
  // Query: collection.findOne({ ticketId: "123456" })
  await db.collection('tickets').createIndex(
    { ticketId: 1 },
    { unique: true, name: 'ticketId_unique_idx' }
  );
  console.log("    ✅ Created: { ticketId: 1 } (unique)");

  // Index for finding user's tickets by email
  // Query: collection.find({ email, date })
  await db.collection('tickets').createIndex(
    { email: 1, date: 1 },
    { name: 'email_date_idx' }
  );
  console.log("    ✅ Created: { email: 1, date: 1 }");

  // ============================================================
  // LOTTERIES COLLECTION INDEXES
  // ============================================================

  console.log("  🎰 Creating indexes for 'lotteries' collection...");

  // Unique index for lottery date (ensures only one lottery per day)
  // Query: collection.findOne({ date })
  await db.collection('lotteries').createIndex(
    { date: 1 },
    { unique: true, name: 'date_unique_idx' }
  );
  console.log("    ✅ Created: { date: 1 } (unique)");

  console.log("\n✅ All indexes created successfully!");
  console.log("\n📊 Index Summary:");
  console.log("  • registrants: 2 indexes");
  console.log("  • tickets: 3 indexes");
  console.log("  • lotteries: 1 index");
  console.log("  • Total: 6 indexes\n");
}

/**
 * Lists all existing indexes for verification
 */
export async function listIndexes() {
  const db = await getDb();

  console.log("\n📋 Current Indexes:\n");

  const collections = ['registrants', 'tickets', 'lotteries'];

  for (const collName of collections) {
    const indexes = await db.collection(collName).indexes();
    console.log(`${collName}:`);
    indexes.forEach((idx) => {
      console.log(`  - ${idx.name}: ${JSON.stringify(idx.key)}`);
    });
    console.log();
  }
}

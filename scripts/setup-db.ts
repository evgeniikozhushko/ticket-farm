/**
 * Standalone script to set up database indexes
 *
 * Run this script once to create all necessary MongoDB indexes:
 *
 *   npx tsx scripts/setup-db.ts
 *
 * Or add to package.json:
 *   "scripts": {
 *     "setup-db": "tsx scripts/setup-db.ts"
 *   }
 *
 * Then run: npm run setup-db
 */

import * as dotenv from "dotenv";

dotenv.config({ path: ".env.local" });

async function main() {
  const { setupIndexes, listIndexes, verifyRequiredIndexes } = await import('../lib/setup-indexes');

  console.log("╔════════════════════════════════════════════════╗");
  console.log("║    Ticket Farm Database Setup Script              ║");
  console.log("╚════════════════════════════════════════════════╝\n");

  try {
    // Create indexes
    await setupIndexes();

    // List all indexes for verification
    await listIndexes();
    await verifyRequiredIndexes();

    console.log("╔════════════════════════════════════════════════╗");
    console.log("║    ✅ Setup completed successfully!           ║");
    console.log("╚════════════════════════════════════════════════╝\n");

    process.exit(0);
  } catch (error) {
    console.error("\n❌ Setup failed:", error);
    process.exit(1);
  }
}

main();

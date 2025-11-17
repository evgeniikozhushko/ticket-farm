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

import { setupIndexes, listIndexes } from '../lib/setup-indexes';

async function main() {
  console.log("╔════════════════════════════════════════════════╗");
  console.log("║    Tickety Database Setup Script              ║");
  console.log("╚════════════════════════════════════════════════╝\n");

  try {
    // Create indexes
    await setupIndexes();

    // List all indexes for verification
    await listIndexes();

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

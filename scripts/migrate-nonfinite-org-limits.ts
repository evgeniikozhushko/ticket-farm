/**
 * One-time migration/check for legacy unlimited organization limits.
 *
 * MongoDB can persist Infinity-like legacy values as non-finite doubles. The
 * application now uses null to mean Scale/unlimited.
 */

import { getOrganizationsCollection } from '../lib/mongodb';

async function main() {
  const collection = await getOrganizationsCollection();

  const result = await collection.updateMany(
    {
      $or: [
        { maxRegistrantsPerDay: Infinity },
        { maxRegistrantsPerDay: -Infinity },
        { maxRegistrantsPerDay: NaN },
      ],
    },
    {
      $set: {
        maxRegistrantsPerDay: null,
        updatedAt: new Date(),
      },
    }
  );

  console.log(
    `Checked organization maxRegistrantsPerDay values; normalized ${result.modifiedCount} legacy non-finite value(s) to null.`
  );
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("Migration failed:", error);
    process.exit(1);
  });

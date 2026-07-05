import * as dotenv from "dotenv";
import { MongoClient } from "mongodb";

dotenv.config({ path: ".env.local" });
dotenv.config({ path: ".env" });

function parseArgs(argv: string[]): Record<string, string> {
  const args: Record<string, string> = {};
  for (let i = 2; i < argv.length; i++) {
    const key = argv[i];
    if (key?.startsWith("--")) {
      const name = key.slice(2);
      const value = argv[i + 1];
      if (value && !value.startsWith("--")) {
        args[name] = value;
        i++;
      } else {
        args[name] = "true";
      }
    }
  }
  return args;
}

function redactUri(uri: string): string {
  return uri.replace(/^(mongodb(?:\+srv)?:\/\/)([^@]+)@/, "$1***:***@");
}

function printHints(err: unknown) {
  const msg = err instanceof Error ? err.message : String(err);
  const lower = msg.toLowerCase();

  console.error("\nTroubleshooting hints:");

  if (lower.includes("bad auth") || lower.includes("code: 8000")) {
    console.error(
      "  - Atlas auth failed. Check MONGODB_URI password in Vercel Production env.",
    );
    console.error(
      "  - The Atlas Connect string shows '<db_password>' as a placeholder; it must be replaced with the real password.",
    );
    console.error(
      "  - Percent-encode special characters in the password (@ #: /:).",
    );
  }
  if (lower.includes("tlsv1 alert") || lower.includes("ssl alert")) {
    console.error(
      "  - Atlas rejected the TLS handshake. Most common cause: the URI still contains the literal <db_password> placeholder.",
    );
    console.error(
      "  - Confirm the cluster is not paused and Network Access includes 0.0.0.0/0 on the correct Atlas PROJECT (not just the correct cluster).",
    );
  }
  if (lower.includes("replicasetnoprimary")) {
    console.error(
      "  - Driver could not reach a primary. Cluster may be paused, misconfigured, or unreachable.",
    );
  }
  if (lower.includes("querysrv") || lower.includes("enotfound")) {
    console.error(
      "  - DNS/SRV lookup failed. Verify MONGODB_URI hostname matches Atlas Connect string.",
    );
  }

  console.error(
    "  - After editing Vercel env vars, redeploy the latest deployment (env changes do not apply retroactively).",
  );
  console.error(
    "  - Verify env vars are scoped to Production (not Preview/Development) if you're diagnosing prod.",
  );
}

async function main() {
  const args = parseArgs(process.argv);

  const uri = process.env.MONGODB_URI;
  const dbName = process.env.MONGODB_DB_NAME;

  if (!uri) {
    console.error("MONGODB_URI is not set. Export it or add to .env.local / .env.");
    process.exit(1);
  }
  if (!dbName) {
    console.error("MONGODB_DB_NAME is not set. Export it or add to .env.local / .env.");
    process.exit(1);
  }

  console.log("Ticket Farm — DB connectivity check");
  console.log("  URI:", redactUri(uri));
  console.log("  DB name:", dbName);

  const client = new MongoClient(uri, { serverSelectionTimeoutMS: 10000 });

  try {
    await client.connect();
    console.log("\n✅ Connected");

    const admin = client.db().admin();
    const info = await admin.serverInfo();
    console.log("  MongoDB server version:", info.version);

    const db = client.db(dbName);
    const collections = await db.listCollections().toArray();
    console.log(`  Collections in '${dbName}':`, collections.map((c) => c.name).join(", ") || "(none)");

    const orgsCount = await db.collection("organizations").countDocuments();
    console.log(`  organizations count:`, orgsCount);

    if (args["org-name"]) {
      const doc = await db.collection("organizations").findOne({ name: args["org-name"] });
      console.log(`\n  Lookup by name='${args["org-name"]}':`, doc ? doc : "(not found)");
    }
    if (args["org-slug"]) {
      const doc = await db.collection("organizations").findOne({ slug: args["org-slug"] });
      console.log(`\n  Lookup by slug='${args["org-slug"]}':`, doc ? doc : "(not found)");
    }
    if (args["clerk-org-id"]) {
      const doc = await db.collection("organizations").findOne({ clerkOrgId: args["clerk-org-id"] });
      console.log(`\n  Lookup by clerkOrgId='${args["clerk-org-id"]}':`, doc ? doc : "(not found)");
    }

    await client.close();
    process.exit(0);
  } catch (err) {
    console.error("\n❌ Connection failed:");
    console.error(err);
    printHints(err);
    await client.close().catch(() => {});
    process.exit(1);
  }
}

main();

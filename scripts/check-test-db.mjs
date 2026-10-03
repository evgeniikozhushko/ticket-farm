import { MongoClient } from "mongodb";

const uri = process.env.TICKET_FARM_TEST_MONGODB_URI;
if (!uri || !/^mongodb:\/\/(127\.0\.0\.1|localhost):\d+\//.test(uri)) {
  console.error("Release tests require TICKET_FARM_TEST_MONGODB_URI pointing to a disposable localhost MongoDB replica set. See RELEASE_CHECKS.md.");
  process.exit(1);
}

const client = new MongoClient(uri, { serverSelectionTimeoutMS: 5000 });
try {
  await client.connect();
  const hello = await client.db("admin").command({ hello: 1 });
  if (!hello.setName || !hello.isWritablePrimary) {
    throw new Error("A ready writable MongoDB replica set is required.");
  }
  console.log(`Local test replica set ${hello.setName} is ready.`);
} catch {
  console.error("Test replica set is unavailable or not writable. Start and initialize it using RELEASE_CHECKS.md.");
  process.exitCode = 1;
} finally {
  await client.close();
}

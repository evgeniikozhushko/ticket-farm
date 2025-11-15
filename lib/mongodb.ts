import { MongoClient, Db, Collection } from 'mongodb'
import type { Registrant, Lottery, Ticket } from './types'

const uri = process.env.MONGODB_URI
const dbName = process.env.MONGODB_DB_NAME


if (!uri) {
  throw new Error("MONGODB_URI is not set in environment variables");
}

if (!dbName) {
  throw new Error("MONGODB_DB_NAME is not set in environment variables");
}

// We cache the client across hot reloads in development and across invocations in serverless.
interface CachedMongoClient {
  client: MongoClient | null;
  promise: Promise<MongoClient> | null;
}

// Attach to globalThis so it's shared
const globalForMongo = globalThis as unknown as {
  _mongoClientCache?: CachedMongoClient;
};

const mongoClientCache: CachedMongoClient =
  globalForMongo._mongoClientCache ?? {
    client: null,
    promise: null,
  };

globalForMongo._mongoClientCache = mongoClientCache;

async function getClient(): Promise<MongoClient>  {

  if (mongoClientCache.client) {
    return mongoClientCache.client
  }

  if (!mongoClientCache.promise) {
    mongoClientCache.promise = MongoClient.connect(uri!)
  }

  mongoClientCache.client = await mongoClientCache.promise
  return mongoClientCache.client
}

export async function getDb(): Promise<Db> {
  const client = await getClient();
  return client.db(dbName);
}

// --- Typed collection helpers ---
export async function getRegistrantsCollection(): Promise<
  Collection<Registrant>
> {
  const db = await getDb();
  return db.collection<Registrant>("registrants");
}

export async function getLotteriesCollection(): Promise<Collection<Lottery>> {
  const db = await getDb();
  return db.collection<Lottery>("lotteries");
}

export async function getTicketsCollection(): Promise<Collection<Ticket>> {
  const db = await getDb();
  return db.collection<Ticket>("tickets");
}
import { MongoClient, Db, Collection, type MongoClientOptions } from 'mongodb'
import type {
  Registrant,
  Lottery,
  Ticket,
  Organization,
  ProcessedWebhookEvent,
  EmailDispatch,
  ResultEmailRecipient,
  PublicRegistrationRateLimit,
} from './types'

const uri = process.env.MONGODB_URI
const dbName = process.env.MONGODB_DB_NAME

const mongoClientOptions: MongoClientOptions = {
  maxPoolSize: 10,
  minPoolSize: 0,
  connectTimeoutMS: 5_000,
  serverSelectionTimeoutMS: 5_000,
};


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

export async function getClient(): Promise<MongoClient>  {

  if (mongoClientCache.client) {
    return mongoClientCache.client
  }

  if (!mongoClientCache.promise) {
    const connectionPromise = MongoClient.connect(uri!, mongoClientOptions).catch((error) => {
      if (mongoClientCache.promise === connectionPromise) {
        mongoClientCache.promise = null;
      }
      throw error;
    });
    mongoClientCache.promise = connectionPromise;
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

export async function getOrganizationsCollection(): Promise<Collection<Organization>> {
  const db = await getDb();
  return db.collection<Organization>("organizations");
}

export async function getProcessedWebhookEventsCollection(): Promise<Collection<ProcessedWebhookEvent>> {
  const db = await getDb();
  return db.collection<ProcessedWebhookEvent>("processed_webhook_events");
}

export async function getEmailDispatchesCollection(): Promise<Collection<EmailDispatch>> {
  const db = await getDb();
  return db.collection<EmailDispatch>("email_dispatches");
}

export async function getResultEmailRecipientsCollection(): Promise<Collection<ResultEmailRecipient>> {
  const db = await getDb();
  return db.collection<ResultEmailRecipient>("result_email_recipients");
}

export async function getPublicRegistrationRateLimitsCollection(): Promise<Collection<PublicRegistrationRateLimit>> {
  const db = await getDb();
  return db.collection<PublicRegistrationRateLimit>("public_registration_rate_limits");
}

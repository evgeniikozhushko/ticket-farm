import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const connectMock = vi.hoisted(() => vi.fn());

vi.mock("mongodb", () => ({
  MongoClient: { connect: connectMock },
}));

const mongoCacheGlobal = globalThis as typeof globalThis & {
  _mongoClientCache?: unknown;
};

async function loadMongo() {
  vi.resetModules();
  return import("@/lib/mongodb");
}

describe("MongoDB client cache", () => {
  beforeEach(() => {
    delete mongoCacheGlobal._mongoClientCache;
    process.env.MONGODB_URI = "mongodb://example.test/ticket-farm";
    process.env.MONGODB_DB_NAME = "ticket-farm";
    connectMock.mockReset();
  });

  afterEach(() => {
    delete mongoCacheGlobal._mongoClientCache;
    vi.unstubAllEnvs();
  });

  it("recovers on the next request after the first connection fails", async () => {
    const firstError = new Error("Atlas unavailable");
    const client = { db: vi.fn() };
    connectMock.mockRejectedValueOnce(firstError).mockResolvedValueOnce(client);
    const { getClient } = await loadMongo();

    await expect(getClient()).rejects.toBe(firstError);
    await expect(getClient()).resolves.toBe(client);

    expect(connectMock).toHaveBeenCalledTimes(2);
  });

  it("shares one pending connection between concurrent callers", async () => {
    let resolveConnection: (client: unknown) => void;
    const pendingConnection = new Promise((resolve) => {
      resolveConnection = resolve;
    });
    const client = { db: vi.fn() };
    connectMock.mockReturnValue(pendingConnection);
    const { getClient } = await loadMongo();

    const first = getClient();
    const second = getClient();
    expect(connectMock).toHaveBeenCalledTimes(1);

    resolveConnection!(client);
    await expect(Promise.all([first, second])).resolves.toEqual([client, client]);
  });

  it("reuses a successful client", async () => {
    const client = { db: vi.fn() };
    connectMock.mockResolvedValue(client);
    const { getClient } = await loadMongo();

    await expect(getClient()).resolves.toBe(client);
    await expect(getClient()).resolves.toBe(client);

    expect(connectMock).toHaveBeenCalledTimes(1);
  });

  it("connects with the configured URI and fixed beta limits", async () => {
    connectMock.mockResolvedValue({ db: vi.fn() });
    const { getClient } = await loadMongo();

    await getClient();

    expect(connectMock).toHaveBeenCalledWith(
      "mongodb://example.test/ticket-farm",
      {
        maxPoolSize: 10,
        minPoolSize: 0,
        connectTimeoutMS: 5_000,
        serverSelectionTimeoutMS: 5_000,
      },
    );
  });
});

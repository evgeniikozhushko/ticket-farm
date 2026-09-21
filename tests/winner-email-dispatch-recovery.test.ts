import { ObjectId } from "mongodb";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type DispatchRow = {
  _id: ObjectId;
  orgId: string;
  date: string;
  eventName: string;
  payload: unknown;
  status: "pending" | "dispatching" | "dispatched" | "failed";
  attempts: number;
  claimToken?: string;
  lastError?: string;
  dispatchedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
};

// Multi-row in-memory mock of the email_dispatches collection. Implements just
// the slice of Mongo semantics the outbox uses: insertOne assigns an _id,
// findOneAndUpdate honors the same filters dispatchWinnerEmailEvent sends and
// returns the post-update doc, updateOne applies $set and deletes $unset keys.
const store = vi.hoisted(() => {
  let rows: DispatchRow[] = [];

  function matches(row: DispatchRow, filter: Record<string, unknown>): boolean {
    if (!row) return false;
    if (filter._id && !row._id.equals(filter._id as ObjectId)) return false;
    if (filter.eventName !== undefined && row.eventName !== filter.eventName) return false;
    const statusFilter = filter.status as { $in?: string[] } | string | undefined;
    if (typeof statusFilter === "string" && row.status !== statusFilter) return false;
    if (typeof statusFilter === "object" && statusFilter?.$in && !statusFilter.$in.includes(row.status)) return false;
    if (filter.claimToken !== undefined && row.claimToken !== filter.claimToken) return false;
    if (filter.orgId !== undefined && row.orgId !== filter.orgId) return false;
    if (filter.date !== undefined && row.date !== filter.date) return false;
    const updatedAtFilter = filter.updatedAt as { $lt?: Date } | undefined;
    if (updatedAtFilter?.$lt !== undefined && !(row.updatedAt < updatedAtFilter.$lt)) return false;
    const attemptsFilter = filter.attempts as { $lt?: number } | undefined;
    if (attemptsFilter?.$lt !== undefined && !(row.attempts < attemptsFilter.$lt)) return false;
    return true;
  }

  return {
    reset() {
      rows = [];
    },
    only(): DispatchRow {
      if (rows.length !== 1) throw new Error(`expected 1 email_dispatches row, got ${rows.length}`);
      return rows[0];
    },
    collection: {
      insertOne: vi.fn(async (doc: Omit<DispatchRow, "_id"> & { _id?: ObjectId }) => {
        const _id = doc._id ?? new ObjectId();
        rows.push({ ...doc, _id });
        return { acknowledged: true, insertedId: _id };
      }),
      findOneAndUpdate: vi.fn(
        async (
          filter: Record<string, unknown>,
          update: { $set?: Record<string, unknown>; $inc?: Record<string, number> },
        ) => {
          const target = rows.find((candidate) => matches(candidate, filter));
          if (!target) return null;
          if (update.$inc) {
            for (const [k, v] of Object.entries(update.$inc)) {
              (target as Record<string, unknown>)[k] =
                ((target as Record<string, unknown>)[k] as number | undefined ?? 0) + v;
            }
          }
          if (update.$set) {
            for (const [k, v] of Object.entries(update.$set)) {
              (target as Record<string, unknown>)[k] = v;
            }
          }
          return { ...target };
        },
      ),
      updateOne: vi.fn(
        async (
          filter: Record<string, unknown>,
          update: { $set?: Record<string, unknown>; $unset?: Record<string, unknown> },
        ) => {
          const row = rows.find((candidate) => matches(candidate, filter));
          if (!row) return { matchedCount: 0 };
          if (update.$set) {
            for (const [k, v] of Object.entries(update.$set)) {
              (row as Record<string, unknown>)[k] = v;
            }
          }
          if (update.$unset) {
            for (const k of Object.keys(update.$unset)) {
              delete (row as Record<string, unknown>)[k];
            }
          }
          return { matchedCount: 1, modifiedCount: 1 };
        },
      ),
    },
  };
});

const requireRoleMock = vi.hoisted(() => vi.fn());
const getOrganizationMock = vi.hoisted(() => vi.fn());
const inngestSendMock = vi.hoisted(() => vi.fn());

const session = vi.hoisted(() => ({
  withTransaction: vi.fn((fn: () => Promise<void>) => fn()),
}));
const client = vi.hoisted(() => ({
  withSession: vi.fn((fn: (sessionArg: typeof session) => Promise<void>) => fn(session)),
}));
const lotteriesCollection = vi.hoisted(() => ({
  updateOne: vi.fn(),
}));
const registrantsCollection = vi.hoisted(() => ({
  find: vi.fn(),
}));
const ticketsCollection = vi.hoisted(() => ({
  insertMany: vi.fn(),
}));
const recipientsCollection = vi.hoisted(() => ({ insertMany: vi.fn() }));

vi.mock("@/lib/authz", () => ({
  requireRole: requireRoleMock,
  requireActiveSub: vi.fn(() => undefined),
}));

vi.mock("@/lib/orgs", () => ({
  getOrganization: getOrganizationMock,
}));

vi.mock("@/lib/date", () => ({
  getTodayDateString: vi.fn(() => "2026-05-28"),
}));

vi.mock("@/lib/mongodb", () => ({
  getClient: vi.fn(() => Promise.resolve(client)),
  getLotteriesCollection: vi.fn(() => Promise.resolve(lotteriesCollection)),
  getRegistrantsCollection: vi.fn(() => Promise.resolve(registrantsCollection)),
  getTicketsCollection: vi.fn(() => Promise.resolve(ticketsCollection)),
  getEmailDispatchesCollection: vi.fn(() => Promise.resolve(store.collection)),
  getParticipantSummariesCollection: vi.fn(() => Promise.resolve({ bulkWrite: vi.fn(), updateOne: vi.fn() })),
  getResultEmailRecipientsCollection: vi.fn(() => Promise.resolve(recipientsCollection)),
}));

vi.mock("@/inngest/client", () => ({
  inngest: { send: inngestSendMock },
}));

describe("winner email dispatch recovery path", () => {
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    store.reset();
    store.collection.insertOne.mockClear();
    store.collection.findOneAndUpdate.mockClear();
    store.collection.updateOne.mockClear();

    requireRoleMock.mockReset().mockResolvedValue({ orgId: "org_1" });
    getOrganizationMock.mockReset().mockResolvedValue({
      clerkOrgId: "org_1",
      name: "Ticket Farm",
      timezone: "America/Edmonton",
      subscriptionStatus: "active",
      emailFromAddress: "hello@ticketfarm.ca",
      emailFromName: "Ticket Farm",
    });
    inngestSendMock.mockReset();
    client.withSession.mockClear();
    session.withTransaction.mockClear();
    lotteriesCollection.updateOne.mockReset().mockResolvedValue({ matchedCount: 1 });
    registrantsCollection.find.mockReset();
    ticketsCollection.insertMany.mockReset().mockResolvedValue({ insertedCount: 2 });
    recipientsCollection.insertMany.mockReset().mockResolvedValue({ insertedCount: 2 });

    consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
  });

  it("leaves a recoverable outbox row when draw-time dispatch fails, and the cron-shaped dispatch call completes it", async () => {
    // First inngest.send (from drawTodayLottery's post-commit dispatch) fails;
    // the next call (from the recovery cron's dispatch) succeeds.
    inngestSendMock
      .mockRejectedValueOnce(new Error("inngest down"))
      .mockResolvedValue(undefined);

    const registrants = [
      {
        _id: new ObjectId(),
        orgId: "org_1",
        name: "Ada",
        email: "ada@example.com",
        date: "2026-05-28",
        enteredAt: new Date("2026-05-28T12:00:00Z"),
      },
      {
        _id: new ObjectId(),
        orgId: "org_1",
        name: "Lin",
        email: "lin@example.com",
        date: "2026-05-28",
        enteredAt: new Date("2026-05-28T12:01:00Z"),
      },
    ];
    registrantsCollection.find.mockReturnValue({
      toArray: vi.fn().mockResolvedValue(registrants),
    });

    vi.resetModules();
    const { drawTodayLottery } = await import("@/lib/actions/lottery-draw.actions");

    // 1. Draw: outbox row inserted in-txn, post-commit dispatch attempt fails,
    //    draw itself still reports success to the caller.
    const result = await drawTodayLottery(2);
    expect(result.success).toBe(true);
    expect(ticketsCollection.insertMany).toHaveBeenCalledOnce();
    expect(store.collection.insertOne).toHaveBeenCalledOnce();
    expect(recipientsCollection.insertMany).toHaveBeenCalledOnce();
    expect(inngestSendMock).toHaveBeenCalledTimes(1);

    const failed = store.only();
    expect(failed.status).toBe("failed");
    expect(failed.lastError).toBe("inngest down");
    expect(failed.attempts).toBe(1);
    expect(failed.eventName).toBe("lottery/draw.completed");
    expect(failed.payload).toEqual({ orgId: "org_1", date: "2026-05-28", dispatchId: failed._id.toString() });
    // The cron filters on status in {pending, failed} and attempts < MAX_ATTEMPTS (10),
    // so the row is eligible for recovery.
    expect(["pending", "failed"]).toContain(failed.status);
    expect(failed.attempts).toBeLessThan(10);
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      "[drawTodayLottery] Email dispatch failed:",
      expect.any(Error),
    );

    // 2. Simulate the recovery cron's dispatch call — same arg shape as
    //    recoverWinnerEmailDispatchesFunction passes. staleBefore in the future
    //    guarantees the failed row qualifies regardless of clock skew; the
    //    5-minute cron window is a tuning knob, not part of the dispatch contract.
    const { dispatchWinnerEmailEvent } = await import("@/lib/email-dispatch-outbox");
    const claimed = await dispatchWinnerEmailEvent({
      staleBefore: new Date(Date.now() + 60_000),
      maxAttempts: 10,
    });
    expect(claimed).toBe(true);

    const recovered = store.only();
    expect(recovered.status).toBe("dispatched");
    expect(recovered.dispatchedAt).toBeInstanceOf(Date);
    expect(recovered.lastError).toBeUndefined();
    expect(recovered.attempts).toBe(2);
    expect(inngestSendMock).toHaveBeenCalledTimes(2);
    // Both sends use the same idempotency key derived from the row's _id.
    const idemKey = `winner-email-dispatch:${failed._id.toString()}`;
    expect(inngestSendMock.mock.calls[0][0]).toMatchObject({ id: idemKey });
    expect(inngestSendMock.mock.calls[1][0]).toMatchObject({ id: idemKey });
  });

  it("reclaims an interrupted claim and ignores the old worker's completion", async () => {
    const inserted = await store.collection.insertOne({
      orgId: "org_1",
      date: "2026-05-28",
      eventName: "lottery/draw.completed",
      payload: { orgId: "org_1", date: "2026-05-28", tickets: [] },
      status: "pending",
      attempts: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    let releaseFirst!: () => void;
    let firstSendStarted!: () => void;
    const started = new Promise<void>((resolve) => { firstSendStarted = resolve; });
    inngestSendMock
      .mockImplementationOnce(() => new Promise<void>((resolve) => {
        releaseFirst = resolve;
        firstSendStarted();
      }))
      .mockResolvedValueOnce(undefined);
    const { dispatchWinnerEmailEvent } = await import("@/lib/email-dispatch-outbox");

    const first = dispatchWinnerEmailEvent({ dispatchId: inserted.insertedId });
    await started;
    const firstToken = store.only().claimToken;
    expect(store.only().status).toBe("dispatching");

    // A future cutoff simulates the passage of the five-minute lease.
    expect(await dispatchWinnerEmailEvent({
      dispatchId: inserted.insertedId,
      staleBefore: new Date(Date.now() + 60_000),
      maxAttempts: 10,
    })).toBe(true);
    expect(store.only().status).toBe("dispatched");
    expect(store.only().attempts).toBe(2);

    releaseFirst();
    await first;
    expect(store.only().status).toBe("dispatched");
    expect(store.only().claimToken).toBeUndefined();
    expect(firstToken).not.toBeUndefined();
    expect(store.collection.updateOne).toHaveBeenLastCalledWith(
      { _id: inserted.insertedId, status: "dispatching", claimToken: firstToken },
      expect.any(Object),
    );
    expect(inngestSendMock.mock.calls.map(([event]) => event.id)).toEqual([
      `winner-email-dispatch:${inserted.insertedId.toString()}`,
      `winner-email-dispatch:${inserted.insertedId.toString()}`,
    ]);
  });
});

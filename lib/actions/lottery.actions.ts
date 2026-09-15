"use server";

import { MongoError, ObjectId } from "mongodb";
import { headers } from "next/headers";
import { createHash, randomInt } from "crypto";
import {
  getClient,
  getLotteriesCollection,
  getPublicRegistrationRateLimitsCollection,
  getRegistrantsCollection,
} from "@/lib/mongodb";
import { getTodayDateString } from "@/lib/date";
import { isDuplicateKeyError } from "@/lib/mongo-errors";
import { getOrgBySlug } from "@/lib/orgs";
import type { Registrant } from "@/lib/types";

type EnterLotteryResult = { success: true } | { success: false; error: string };

function isValidEmail(email: string): boolean {
  return /\S+@\S+\.\S+/.test(email);
}

const MAX_QUOTA_RETRIES = 5;
const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000;
const PUBLIC_IP_REGISTRATION_LIMIT = 20;
const PUBLIC_EMAIL_REGISTRATION_LIMIT = 5;

type RateLimitConsumption = {
  allowed: boolean;
  consumed: boolean;
  key: string;
};

function hashRateLimitValue(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function getRateLimitWindowStart(date: Date): number {
  return (
    Math.floor(date.getTime() / RATE_LIMIT_WINDOW_MS) * RATE_LIMIT_WINDOW_MS
  );
}

function getRateLimitKey(input: {
  orgId: string;
  scope: "ip" | "email";
  value: string;
  windowStart: number;
}): string {
  return [
    "public-registration",
    input.orgId,
    input.scope,
    hashRateLimitValue(input.value),
    input.windowStart,
  ].join(":");
}

function getEffectiveRegistrationLimit(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0)
    return null;
  return value;
}

async function getClientIp(): Promise<string> {
  const requestHeaders = await headers();
  const forwardedFor = requestHeaders
    .get("x-forwarded-for")
    ?.split(",")[0]
    ?.trim();
  return (
    forwardedFor ||
    requestHeaders.get("x-real-ip") ||
    requestHeaders.get("cf-connecting-ip") ||
    "unknown"
  );
}

async function consumeRegistrationRateLimit(input: {
  orgId: string;
  scope: "ip" | "email";
  value: string;
  limit: number;
}): Promise<RateLimitConsumption> {
  const now = new Date();
  const windowStart = getRateLimitWindowStart(now);
  const expiresAt = new Date(windowStart + RATE_LIMIT_WINDOW_MS);
  const key = getRateLimitKey({ ...input, windowStart });

  const collection = await getPublicRegistrationRateLimitsCollection();

  try {
    const result = await collection.findOneAndUpdate(
      { key, count: { $lt: input.limit } },
      {
        $inc: { count: 1 },
        $set: { updatedAt: now },
        $setOnInsert: {
          key,
          expiresAt,
          createdAt: now,
        },
      },
      { upsert: true, returnDocument: "after" },
    );

    return { allowed: result !== null, consumed: result !== null, key };
  } catch (err) {
    if (isDuplicateKeyError(err)) {
      const retryResult = await collection.updateOne(
        { key, count: { $lt: input.limit } },
        {
          $inc: { count: 1 },
          $set: { updatedAt: now },
        },
      );
      return {
        allowed: retryResult.modifiedCount === 1,
        consumed: retryResult.modifiedCount === 1,
        key,
      };
    }
    throw err;
  }
}

async function rollbackRegistrationRateLimits(
  consumptions: RateLimitConsumption[],
): Promise<void> {
  const consumedKeys = consumptions
    .filter((consumption) => consumption.consumed)
    .map((consumption) => consumption.key);

  if (consumedKeys.length === 0) {
    return;
  }

  try {
    const collection = await getPublicRegistrationRateLimitsCollection();
    await Promise.all(
      consumedKeys.map(async (key) => {
        try {
          await collection.updateOne(
            { key, count: { $gt: 0 } },
            { $inc: { count: -1 }, $set: { updatedAt: new Date() } },
          );
        } catch (err) {
          console.error("[rate-limit] rollback failed:", err);
        }
      }),
    );
  } catch (err) {
    console.error("[rate-limit] rollback failed:", err);
  }
}

class AdmissionError extends Error {}

const CLOSED_MESSAGE = "Registration is closed for today. Check back tomorrow.";
const FULL_MESSAGE = "Registration is full for today. Check back tomorrow.";
const UNAVAILABLE_MESSAGE =
  "Registration is currently unavailable. Please try again later.";
const DUPLICATE_MESSAGE =
  "You've already entered today's lottery. Please check back tomorrow.";

export async function enterLottery(
  orgSlug: string,
  formData: FormData,
): Promise<EnterLotteryResult> {
  const rateLimitConsumptions: RateLimitConsumption[] = [];
  let refundRateLimits = true;
  try {
    const name = String(formData.get("name") ?? "").trim();
    const email = String(formData.get("email") ?? "")
      .trim()
      .toLowerCase();
    const consent = formData.get("consent") === "true";

    if (!name || !email) {
      return { success: false, error: "Name and email are required." };
    }
    if (!isValidEmail(email)) {
      return { success: false, error: "Please enter a valid email address." };
    }
    if (!consent) {
      return { success: false, error: "You must agree to the lottery terms." };
    }

    // Resolve org from slug (public route — no Clerk JWT)
    const org = await getOrgBySlug(orgSlug);
    if (!org) {
      return { success: false, error: "This lottery page is not available." };
    }

    const orgId = org.clerkOrgId;
    const maxRegistrantsPerDay = getEffectiveRegistrationLimit(
      org.maxRegistrantsPerDay,
    );
    const date = getTodayDateString(org.timezone);
    const lotteriesCollection = await getLotteriesCollection();
    const registrantsCollection = await getRegistrantsCollection();

    const existingRegistrant = await registrantsCollection.findOne({
      orgId,
      email,
      date,
    });
    if (existingRegistrant) {
      return {
        success: false,
        error: DUPLICATE_MESSAGE,
      };
    }

    const ip = await getClientIp();
    const limiterResults = await Promise.allSettled([
      consumeRegistrationRateLimit({
        orgId,
        scope: "ip",
        value: ip,
        limit: PUBLIC_IP_REGISTRATION_LIMIT,
      }),
      consumeRegistrationRateLimit({
        orgId,
        scope: "email",
        value: email,
        limit: PUBLIC_EMAIL_REGISTRATION_LIMIT,
      }),
    ]);
    for (const result of limiterResults) {
      if (result.status === "fulfilled")
        rateLimitConsumptions.push(result.value);
    }
    const limiterFailure = limiterResults.find(
      (result) => result.status === "rejected",
    );
    if (limiterFailure?.status === "rejected") throw limiterFailure.reason;
    if (rateLimitConsumptions.some((consumption) => !consumption.allowed)) {
      return {
        success: false,
        error: "Too many registration attempts. Please try again later.",
      };
    }

    // Initialization cannot reopen or reset an existing lottery. The unique
    // (orgId, date) index arbitrates concurrent first registrations.
    for (let attempt = 0; attempt < MAX_QUOTA_RETRIES; attempt++) {
      try {
        await lotteriesCollection.updateOne(
          { orgId, date },
          {
            $setOnInsert: {
              orgId,
              date,
              status: "OPEN",
              registrantCount: 0,
              dailyTheme: "",
              maxTicketsAvailable: 0,
            },
          },
          { upsert: true },
        );
        break;
      } catch (err) {
        if (isDuplicateKeyError(err) && attempt < MAX_QUOTA_RETRIES - 1) {
          await new Promise((resolve) =>
            setTimeout(resolve, randomInt(20, 100)),
          );
          continue;
        }
        throw err;
      }
    }

    // Keep the identity stable across callback and commit retries.
    const newRegistrant: Registrant = {
      _id: new ObjectId(),
      orgId,
      name,
      email,
      date,
      enteredAt: new Date(),
    };
    const client = await getClient();
    try {
      await client.withSession(async (session) => {
        await session.withTransaction(
          async () => {
            const lottery = await lotteriesCollection.findOne(
              { orgId, date },
              { session },
            );
            if (!lottery) throw new AdmissionError(UNAVAILABLE_MESSAGE);
            if (
              lottery.status === "CLOSED" ||
              lottery.status === "LOTTERY_DRAWN"
            ) {
              throw new AdmissionError(CLOSED_MESSAGE);
            }
            if (lottery.status !== "OPEN")
              throw new AdmissionError(UNAVAILABLE_MESSAGE);

            let count = lottery.registrantCount;
            if (count === undefined) {
              count = await registrantsCollection.countDocuments(
                { orgId, date },
                { session },
              );
              await lotteriesCollection.updateOne(
                {
                  orgId,
                  date,
                  status: "OPEN",
                  registrantCount: { $exists: false },
                },
                { $set: { registrantCount: count } },
                { session },
              );
            }
            if (!Number.isSafeInteger(count) || count < 0)
              throw new AdmissionError(UNAVAILABLE_MESSAGE);

            // The draw writes this same document: either admission commits first
            // and enters its snapshot, or the retry observes the closed lottery.
            const claimed = await lotteriesCollection.findOneAndUpdate(
              {
                orgId,
                date,
                status: "OPEN",
                ...(maxRegistrantsPerDay === null
                  ? {}
                  : { registrantCount: { $lt: maxRegistrantsPerDay } }),
              },
              { $inc: { registrantCount: 1 } },
              { session, returnDocument: "after" },
            );
            if (!claimed) {
              const current = await lotteriesCollection.findOne(
                { orgId, date },
                { session },
              );
              if (
                current?.status === "CLOSED" ||
                current?.status === "LOTTERY_DRAWN"
              ) {
                throw new AdmissionError(CLOSED_MESSAGE);
              }
              if (
                current?.status === "OPEN" &&
                Number.isSafeInteger(current.registrantCount) &&
                current.registrantCount >= 0 &&
                maxRegistrantsPerDay !== null &&
                current.registrantCount >= maxRegistrantsPerDay
              ) {
                throw new AdmissionError(FULL_MESSAGE);
              }
              throw new AdmissionError(UNAVAILABLE_MESSAGE);
            }
            await registrantsCollection.insertOne(newRegistrant, { session });
          },
          {
            readConcern: { level: "snapshot" },
            writeConcern: { w: "majority" },
            readPreference: "primary",
          },
        );
      });
    } catch (err) {
      if (
        err instanceof MongoError &&
        err.hasErrorLabel("UnknownTransactionCommitResult")
      ) {
        // Absence after an uncertain commit does not prove that it aborted.
        refundRateLimits = false;
        try {
          const committed = await registrantsCollection.findOne(
            { _id: newRegistrant._id, orgId, date },
            { readPreference: "primary", readConcern: { level: "majority" } },
          );
          if (committed) return { success: true };
        } catch (confirmationError) {
          console.error(
            "[registration] commit confirmation failed:",
            confirmationError,
          );
        }
        return {
          success: false,
          error: "Unable to confirm registration. Please try again later.",
        };
      }
      // Classify only after withTransaction has aborted; transient errors must
      // reach the driver unchanged so it can retry the whole transaction.
      if (isDuplicateKeyError(err))
        return { success: false, error: DUPLICATE_MESSAGE };
      throw err;
    }

    refundRateLimits = false;
    return { success: true };
  } catch (err) {
    if (err instanceof AdmissionError)
      return { success: false, error: err.message };
    console.error("enterLottery error:", err);
    return {
      success: false,
      error: "Something went wrong on our side. Please try again.",
    };
  } finally {
    if (refundRateLimits)
      await rollbackRegistrationRateLimits(rateLimitConsumptions);
  }
}

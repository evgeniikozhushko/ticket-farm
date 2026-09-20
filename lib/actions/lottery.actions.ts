"use server";

import { MongoError, ObjectId } from "mongodb";
import { headers } from "next/headers";
import { createHash, randomInt } from "crypto";
import { isIP } from "node:net";
import { z } from "zod";
import {
  getClient,
  getLotteriesCollection,
  getPublicRegistrationRateLimitsCollection,
  getRegistrantsCollection,
} from "@/lib/mongodb";
import { getTodayDateString } from "@/lib/date";
import { isDuplicateKeyError } from "@/lib/mongo-errors";
import { getOrgBySlug } from "@/lib/orgs";
import { parseOrgSlug } from "@/lib/slugs";
import { verifyRegistrationChallenge } from "@/lib/turnstile";
import type { Registrant } from "@/lib/types";

type EnterLotteryResult = { success: true } | { success: false; error: string };

const MAX_QUOTA_RETRIES = 5;
const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000;
const PUBLIC_IP_REGISTRATION_LIMIT = 500;
const PUBLIC_EMAIL_REGISTRATION_LIMIT = 10;
const registrationSchema = z.object({
  name: z.string().trim().min(1).max(120),
  email: z.string().trim().toLowerCase().max(254).email(),
  consent: z.literal("true"),
  token: z.string().min(1).max(2048),
});

function hashRateLimitValue(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function getRateLimitWindowStart(date: Date): number {
  return (
    Math.floor(date.getTime() / RATE_LIMIT_WINDOW_MS) * RATE_LIMIT_WINDOW_MS
  );
}

function getRateLimitKey(input: {
  scope: "ip" | "email-slug";
  value: string;
  windowStart: number;
}): string {
  return [
    "public-registration",
    input.scope,
    hashRateLimitValue(input.value),
    input.windowStart,
  ].join(":");
}

function getIpAttemptLimit(): number {
  const override = process.env.PUBLIC_REGISTRATION_IP_ATTEMPT_LIMIT;
  if (!override || !/^[1-9]\d*$/.test(override)) return PUBLIC_IP_REGISTRATION_LIMIT;
  const parsed = Number(override);
  return Number.isSafeInteger(parsed) && parsed <= 100000
    ? parsed
    : PUBLIC_IP_REGISTRATION_LIMIT;
}

function getEffectiveRegistrationLimit(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0)
    return null;
  return value;
}

async function getClientIp(): Promise<string> {
  const requestHeaders = await headers();
  const header = requestHeaders.get("x-vercel-forwarded-for")
    ?? requestHeaders.get("x-forwarded-for");
  if (header === null && process.env.NODE_ENV === "development") return "127.0.0.1";
  const ip = header?.trim() ?? "";
  if (!isIP(ip)) throw new Error("Invalid registration client IP");
  return ip;
}

async function consumeRegistrationRateLimit(input: {
  scope: "ip" | "email-slug";
  value: string;
  limit: number;
}): Promise<boolean> {
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

    return result !== null;
  } catch (err) {
    if (isDuplicateKeyError(err)) {
      const retryResult = await collection.updateOne(
        { key, count: { $lt: input.limit } },
        {
          $inc: { count: 1 },
          $set: { updatedAt: now },
        },
      );
      return retryResult.modifiedCount === 1;
    }
    throw err;
  }
}

class AdmissionError extends Error {}

const CLOSED_MESSAGE = "Registration is closed for today. Check back tomorrow.";
const FULL_MESSAGE = "Registration is full for today. Check back tomorrow.";
const UNAVAILABLE_MESSAGE =
  "Registration is currently unavailable. Please try again later.";
export async function enterLottery(
  orgSlug: string,
  formData: FormData,
): Promise<EnterLotteryResult> {
  try {
    const ip = await getClientIp();
    if (!await consumeRegistrationRateLimit({
      scope: "ip", value: ip, limit: getIpAttemptLimit(),
    })) return { success: false, error: "Too many registration attempts. Please try again later." };

    const parsed = registrationSchema.safeParse({
      name: formData.get("name"),
      email: formData.get("email"),
      consent: formData.get("consent"),
      token: formData.get("cf-turnstile-response"),
    });
    if (!parsed.success || typeof orgSlug !== "string" || orgSlug.length > 128) {
      return { success: false, error: "Please check your registration details and try again." };
    }
    let canonicalSlug: string;
    try {
      canonicalSlug = parseOrgSlug(orgSlug);
    } catch {
      return { success: false, error: "This lottery page is not available." };
    }
    const { name, email, token } = parsed.data;
    if (!await consumeRegistrationRateLimit({
      scope: "email-slug",
      value: JSON.stringify([email, canonicalSlug]),
      limit: PUBLIC_EMAIL_REGISTRATION_LIMIT,
    })) return { success: false, error: "Too many registration attempts. Please try again later." };
    if (!await verifyRegistrationChallenge(token, ip)) {
      return { success: false, error: "Security check failed. Please try again." };
    }

    // Resolve org from slug (public route — no Clerk JWT)
    const org = await getOrgBySlug(canonicalSlug);
    if (!org) {
      return { success: false, error: "This lottery page is not available." };
    }

    const orgId = org.clerkOrgId;
    const maxRegistrantsPerDay = getEffectiveRegistrationLimit(
      org.maxRegistrantsPerDay,
    );
    const date = getTodayDateString(org.timezone);
    const registrantsCollection = await getRegistrantsCollection();

    const existingRegistrant = await registrantsCollection.findOne({
      orgId,
      email,
      date,
    });
    if (existingRegistrant) return { success: true };
    const lotteriesCollection = await getLotteriesCollection();

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
      if (isDuplicateKeyError(err)) {
        try {
          const confirmed = await registrantsCollection.findOne(
            { orgId, email, date },
            { readPreference: "primary", readConcern: { level: "majority" } },
          );
          return confirmed
            ? { success: true }
            : { success: false, error: UNAVAILABLE_MESSAGE };
        } catch {
          return { success: false, error: UNAVAILABLE_MESSAGE };
        }
      }
      throw err;
    }

    return { success: true };
  } catch (err) {
    if (err instanceof AdmissionError)
      return { success: false, error: err.message };
    console.error("enterLottery error:", err);
    return {
      success: false,
      error: "Something went wrong on our side. Please try again.",
    };
  }
}

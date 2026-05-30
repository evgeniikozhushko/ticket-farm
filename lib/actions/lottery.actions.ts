"use server";

import { headers } from "next/headers";
import { createHash } from "crypto";
import {
  getLotteriesCollection,
  getPublicRegistrationRateLimitsCollection,
  getRegistrantsCollection,
} from "@/lib/mongodb";
import { getTodayDateString } from "@/lib/date";
import { getOrgBySlug } from "@/lib/org-cache";
import type { Registrant } from "@/lib/types";

type EnterLotteryResult =
  | { success: true }
  | { success: false; error: string };

function isValidEmail(email: string): boolean {
  return /\S+@\S+\.\S+/.test(email);
}

const MAX_QUOTA_RETRIES = 5;
const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000;
const PUBLIC_IP_REGISTRATION_LIMIT = 20;
const PUBLIC_EMAIL_REGISTRATION_LIMIT = 5;

function hashRateLimitValue(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function getEffectiveRegistrationLimit(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) return null;
  return value;
}

async function getClientIp(): Promise<string> {
  const requestHeaders = await headers();
  const forwardedFor = requestHeaders.get("x-forwarded-for")?.split(",")[0]?.trim();
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
}): Promise<boolean> {
  const now = new Date();
  const windowStart = Math.floor(now.getTime() / RATE_LIMIT_WINDOW_MS) * RATE_LIMIT_WINDOW_MS;
  const expiresAt = new Date(windowStart + RATE_LIMIT_WINDOW_MS);
  const key = [
    "public-registration",
    input.orgId,
    input.scope,
    hashRateLimitValue(input.value),
    windowStart,
  ].join(":");

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
      { upsert: true, returnDocument: "after" }
    );

    return result !== null;
  } catch (err) {
    if ((err as { code?: number }).code === 11000) {
      const retryResult = await collection.updateOne(
        { key, count: { $lt: input.limit } },
        {
          $inc: { count: 1 },
          $set: { updatedAt: now },
        }
      );
      return retryResult.modifiedCount === 1;
    }
    throw err;
  }
}

export async function enterLottery(
  orgSlug: string,
  formData: FormData
): Promise<EnterLotteryResult> {
  try {
    const name = String(formData.get("name") ?? "").trim();
    const email = String(formData.get("email") ?? "").trim().toLowerCase();
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
    const maxRegistrantsPerDay = getEffectiveRegistrationLimit(org.maxRegistrantsPerDay);
    const date = getTodayDateString(org.timezone);
    const lotteriesCollection = await getLotteriesCollection();
    const registrantsCollection = await getRegistrantsCollection();
    const ip = await getClientIp();

    const [ipAllowed, emailAllowed] = await Promise.all([
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

    if (!ipAllowed || !emailAllowed) {
      return {
        success: false,
        error: "Too many registration attempts. Please try again later.",
      };
    }

    // -------------------------------------------------------------------------
    // Step 1: Atomically claim a quota slot on the Lottery document.
    //
    // The conditional `registrantCount` guard is only included for capped plans.
    // A null maxRegistrantsPerDay means unlimited and skips the $lt guard.
    // Legacy lottery rows may not have registrantCount yet; treat a missing
    // counter as 0 so the next registration can initialize it with $inc.
    //
    // $inc alone initializes registrantCount to 1 on new documents (MongoDB treats
    // a missing field as 0). Do NOT also set registrantCount in $setOnInsert —
    // combining $inc and $setOnInsert on the same field causes a double-write.
    //
    // Concurrent first-registrations can both attempt the upsert and one will
    // get E11000 on the unique { orgId, date } index. Jittered retry handles
    // this without thundering herd.
    // -------------------------------------------------------------------------
    let quotaResult = null;
    for (let attempt = 0; attempt < MAX_QUOTA_RETRIES; attempt++) {
      try {
        quotaResult = await lotteriesCollection.findOneAndUpdate(
          {
            orgId,
            date,
            status: { $ne: "LOTTERY_DRAWN" },
            ...(maxRegistrantsPerDay === null
              ? {}
              : {
                  $or: [
                    { registrantCount: { $lt: maxRegistrantsPerDay } },
                    { registrantCount: { $exists: false } },
                  ],
                }),
          },
          {
            $inc: { registrantCount: 1 },
            $setOnInsert: {
              orgId,
              date,
              status: "OPEN",
              dailyTheme: "",
              maxTicketsAvailable: 0,
            },
          },
          { upsert: true, returnDocument: "after" }
        );
        break;
      } catch (err) {
        // E11000 can occur when two concurrent first-registrations both try to
        // upsert the same { orgId, date } Lottery document simultaneously.
        if (
          (err as { code?: number }).code === 11000 &&
          attempt < MAX_QUOTA_RETRIES - 1
        ) {
          // Jittered backoff: 20–100 ms
          await new Promise((r) => setTimeout(r, 20 + Math.random() * 80));
          continue;
        }
        if ((err as { code?: number }).code === 11000) {
          console.error("[quota] retry exhausted after", MAX_QUOTA_RETRIES, "attempts");
        }
        throw err;
      }
    }

    // null return: quota is full or lottery is already drawn
    if (!quotaResult) {
      return {
        success: false,
        error: "Registration is full for today. Check back tomorrow.",
      };
    }

    // -------------------------------------------------------------------------
    // Step 2: Insert the registrant. Roll back the quota slot on ANY failure
    // so registrantCount stays accurate as the single source of truth.
    // -------------------------------------------------------------------------
    const newRegistrant: Omit<Registrant, "_id"> = {
      orgId,
      name,
      email,
      date,
      enteredAt: new Date(),
    };

    try {
      await registrantsCollection.insertOne(newRegistrant);
    } catch (err) {
      // Roll back the quota slot (best-effort — if this also fails the counter
      // is off by +1 until the next day resets to 0, which is acceptable).
      await lotteriesCollection.updateOne(
        { orgId, date },
        { $inc: { registrantCount: -1 } }
      );

      // E11000: already registered today
      if (
        typeof err === "object" && err !== null &&
        "code" in err && (err as { code: number }).code === 11000
      ) {
        return {
          success: false,
          error: "You've already entered today's lottery. Please check back tomorrow.",
        };
      }
      throw err;
    }

    return { success: true };
  } catch (err) {
    console.error("enterLottery error:", err);
    return { success: false, error: "Something went wrong on our side. Please try again." };
  }
}

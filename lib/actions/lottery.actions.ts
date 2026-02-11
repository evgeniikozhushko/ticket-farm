"use server";

import { getRegistrantsCollection } from "@/lib/mongodb";
import { getTodayDateString } from "@/lib/date";
import { getOrgBySlug } from "@/lib/org-cache";
import type { Registrant } from "@/lib/types";

type EnterLotteryResult =
  | { success: true }
  | { success: false; error: string };

function isValidEmail(email: string): boolean {
  return /\S+@\S+\.\S+/.test(email);
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

    const date = getTodayDateString(org.timezone);
    const collection = await getRegistrantsCollection();

    const newRegistrant: Omit<Registrant, "_id"> = {
      orgId: org.clerkOrgId,
      name,
      email,
      date,
      enteredAt: new Date(),
    };

    await collection.insertOne(newRegistrant);

    return { success: true };
  } catch (err) {
    // E11000: duplicate key — already registered today
    if (
      typeof err === "object" && err !== null &&
      "code" in err && (err as { code: number }).code === 11000
    ) {
      return { success: false, error: "You've already entered today's lottery. Please check back tomorrow." };
    }
    console.error("enterLottery error:", err);
    return { success: false, error: "Something went wrong on our side. Please try again." };
  }
}

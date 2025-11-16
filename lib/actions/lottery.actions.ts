"use server";

import { getRegistrantsCollection } from "@/lib/mongodb";
import { getTodayDateString } from "@/lib/date";
import type { Registrant } from "@/lib/types";

type EnterLotteryResult =
  | { success: true }
  | { success: false; error: string };

function isValidEmail(email: string): boolean {
  return /\S+@\S+\.\S+/.test(email);
}

export async function enterLottery(formData: FormData): Promise<EnterLotteryResult> {
  try {
    const name = String(formData.get("name") ?? "").trim();
    const email = String(formData.get("email") ?? "").trim().toLowerCase();
    const consent = formData.get("consent") === "true"

    // Basic validation
    if (!name || !email) {
      return {
        success: false,
        error: "Name and email are required.",
      };
    }

    if (!isValidEmail(email)) {
      return {
        success: false,
        error: "Please enter a valid email address.",
      };
    }

    if (!consent) {
        return {
          success: false,
          error: "You must agree to the lottery terms.",
        };
      }

    const date = getTodayDateString();
    const collection = await getRegistrantsCollection();

    // Check if already registered today
    const existing = await collection.findOne({ email, date });

    if (existing) {
      return {
        success: false,
        error: "You’ve already entered today’s lottery. Please check back tomorrow.",
      };
    }

    const newRegistrant: Omit<Registrant, "_id"> = {
      name,
      email,
      date,
      enteredAt: new Date(),
    };

    await collection.insertOne(newRegistrant);

    return { success: true };
  } catch (err) {
    console.error("enterLottery error:", err);
    return {
      success: false,
      error: "Something went wrong on our side. Please try again.",
    };
  }
}

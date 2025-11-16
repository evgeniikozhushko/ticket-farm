import { NextRequest, NextResponse } from 'next/server'
import { getRegistrantsCollection } from '@/lib/mongodb'
import type { Registrant } from "@/lib/types"
import { getTodayDateString } from "@/lib/date";

function isValidEmail(email: string): boolean {
  return /\S+@\S+\.\S+/.test(email);
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const name = (body.name ?? "").trim()
    const email = (body.email ?? "").trim().toLowerCase()

    if (!name || !email) {
      return NextResponse.json(
        { status: "error", message: "Name and Email are required" },
        { status: 404 },
      )
    }

    if (!isValidEmail(email)) {
      return NextResponse.json(
        { status: "error", message: "Invalid email address" },
        { status: 400 },
      );
    }

    const date = getTodayDateString()
    const collection = await getRegistrantsCollection()

    // Check for registration dublicates
    const existing = await collection.findOne({email, date})

    if (existing) {
      return NextResponse.json(
        { status: "already_entered", message: "Already registered for today" },
        { status: 200 },
      )
    }

    const newRegistrant: Omit<Registrant, "_id"> = {
      name,
      email,
      date,
      enteredAt: new Date(),
    };

    const result = await collection.insertOne(newRegistrant);

    return NextResponse.json(
      {
        status: "entered",
        id: result.insertedId.toString(),
      },
      { status: 201 },
    );
  } catch (error) {
    console.error("Error in /api/registrants:", error)
    return NextResponse.json(
      { status: "error", message: "Internal server error" },
      { status: 500 },
    )
  }
}
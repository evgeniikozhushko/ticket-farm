import { NextResponse } from 'next/server'
import { getDb } from '@/lib/mongodb'

export async function GET() {
  try {
    const db = await getDb()
    const collections = await db.listCollections().toArray()

    return NextResponse.json({
      ok: true,
      dbname: db.databaseName,
      collections: collections.map((c) => c.name),
    })
  } catch (error) {
    console.log("debug-db error:", error)

    return NextResponse.json(
      {
        ok: false,
        error: String(error),
      },
      { status: 500 },
    );
  }
}
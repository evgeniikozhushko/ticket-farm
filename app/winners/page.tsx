import Link from "next/link"
import { getTicketsCollection } from "@/lib/mongodb"
import { getTodayDateString } from "@/lib/date"
import type { Ticket } from '@/lib/types'

/**
 * Server-side function to fetch today's winning tickets from MongoDB.
 * Returns tickets with ACTIVE or CANCELED status, sorted by ticket number.
 */

async function getTodayWinners(): Promise<Ticket[]> {
  const collection = await getTicketsCollection()
  const date = getTodayDateString()

   // Query tickets for today, include ACTIVE and CANCELED
   const tickets = await collection.find({
    date,
    status: { $in: ["ACTIVE", "CANCELED"]}
   })
   .sort({ ticketNumber: 1 })
   .toArray()

   return tickets
}

/**
 * Winners page - displays today's winning tickets publicly.
 * Shows ticket numbers and IDs (no personal information).
 */
export default async function WinnersPage() {
  const today = new Date().toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  })

  // Fetch winning tickets from database
  const winners = await getTodayWinners()

   /**
   * Format ticket number with zero padding (1 → "001", 27 → "027")
   */
   function formatTicketNumber(num: number): string {
    return String(num).padStart(3, "0")
  }

  /**
   * Determine status display color based on ticket status
   */
  function getStatusColor(status: Ticket["status"]): string {
    if (status === "CANCELED") {
      return "text-destructive"
    }
    return "text-primary" // ACTIVE tickets
  }

  return (
    <div className="min-h-screen bg-linear-135 from-stone-100 from-10% to-lime-200 to-90%">
      <div className="mx-auto max-w-2xl px-4 py-8 sm:px-6 lg:px-8">
        {/* Header */}
        <header className="mb-8 text-center">
          <Link href="/" className="mb-4 inline-flex items-center gap-2 text-primary hover:underline">
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
            Back to lottery entry
          </Link>
          <div className="mb-2 flex items-center justify-center gap-2">
            <h1 className="text-4xl font-bold text-foreground">Canmore Food Recovery Barn</h1>
          </div>
        </header>

        {/* Winners Card */}
        <div className="rounded-2xl bg-card p-6 shadow-lg sm:p-8">
          <div className="mb-6 space-y-2 text-center">
            <p className="text-sm font-medium text-muted-foreground uppercase">{today}</p>
            <h2 className="text-2xl font-bold text-balance text-foreground">{"Today's"} Winning Tickets</h2>
            <p className="text-pretty leading-relaxed text-muted-foreground">
              {winners.length === 0 
                ? "No winners have been drawn yet. Check back later!"
                : "If your ticket number is listed below, check your email for your digital ticket."
              }
            </p>
          </div>

          {/* Tickets List or Empty State */}
          {winners.length > 0 ? (
            <div className="space-y-3">
              {winners.map((winner) => (
                <div
                  key={winner._id?.toString()}
                  className="flex items-center justify-between rounded-lg border border-border bg-secondary/30 px-4 py-3 sm:px-6"
                >
                  {/* Left: Ticket Number */}
                  <div className="flex items-center gap-3">
                    <span className="font-mono text-lg font-bold text-foreground">
                      #{formatTicketNumber(winner.ticketNumber)}
                    </span>
                  </div>

                  {/* Right: Ticket ID */}
                  <span className={`font-mono text-sm font-medium ${getStatusColor(winner.status)}`}>
                    {winner.ticketId}
                    {winner.status === "CANCELED" && (
                      <span className="ml-2 text-xs">(Canceled)</span>
                    )}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            // Empty state when no tickets exist
            <div className="py-8 text-center text-muted-foreground">
              <p className="text-lg font-medium">The lottery hasn't been drawn yet.</p>
              <p className="mt-2 text-sm">Winners will appear here once the admin runs today's lottery.</p>
            </div>
          )}

          {/* Info Footer */}
          <div className="mt-6 rounded-lg bg-secondary/50 p-4">
            <p className="text-center text-sm leading-relaxed text-muted-foreground">
              Winners receive their digital ticket via email. Show your ticket at the door during your pickup time.
            </p>
          </div>
        </div>

        {/* Footer */}
        <footer className="mt-8 text-center text-sm text-muted-foreground">
          <p>Canmore Food Recovery Program</p>
        </footer>
      </div>
    </div>
  )
}

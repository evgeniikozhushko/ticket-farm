import Link from "next/link"

export default function WinnersPage() {
  const today = new Date().toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  })

  // const winners = [
  //   { ticketNumber: "001", status: "5:30 PM", id: {ticket.id} },
  //   { ticketNumber: "002", status: "5:30 PM", id: {ticket.id} },
  //   { ticketNumber: "003", status: "5:30 PM", id: {ticket.id} },
  //   { ticketNumber: "004", status: "5:30 PM", id: {ticket.id} },
  //   { ticketNumber: "005", status: "5:30 PM", id: {ticket.id} },
  //   { ticketNumber: "006", status: "5:30 PM", id: {ticket.id} },
  //   { ticketNumber: "007", status: "Canceled", id: {ticket.id} },
  //   { ticketNumber: "008", status: "5:30 PM", id: {ticket.id} },
  //   { ticketNumber: "009", status: "5:30 PM", id: {ticket.id} },
  //   { ticketNumber: "010", status: "5:30 PM", id: {ticket.id} },
  // ]
    const winners = [
    { ticketNumber: "001", status: "5:30 PM"},
    { ticketNumber: "002", status: "5:30 PM"},
    { ticketNumber: "003", status: "5:30 PM"},
    { ticketNumber: "004", status: "5:30 PM"},
    { ticketNumber: "005", status: "5:30 PM"},
    { ticketNumber: "006", status: "5:30 PM"},
    { ticketNumber: "007", status: "Canceled" },
    { ticketNumber: "008", status: "5:30 PM"},
    { ticketNumber: "009", status: "5:30 PM"},
    { ticketNumber: "010", status: "5:30 PM"},
  ]

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
          {/* <p className="text-lg text-muted-foreground">Food Recovery Lottery</p> */}
        </header>

        {/* Today's Theme Badge */}
        {/* <div className="mb-6 flex items-center justify-center gap-3 rounded-xl bg-secondary p-4">
          <div className="text-6xl" role="img" aria-label="Strawberry">
            🍓
          </div>
          <div className="text-left">
            <p className="text-sm font-medium text-muted-foreground">{"Today's Theme"}</p>
            <p className="text-2xl font-bold text-foreground">Strawberry</p>
          </div>
        </div> */}

        {/* Winners Card */}
        <div className="rounded-2xl bg-card p-6 shadow-lg sm:p-8">
          <div className="mb-6 space-y-2 text-center">
            <p className="text-sm font-medium text-muted-foreground uppercase">{today}</p>
            <h2 className="text-2xl font-bold text-balance text-foreground">{"Today's"} Winning Tickets</h2>
            <p className="text-pretty leading-relaxed text-muted-foreground">
              If your ticket number is listed as a winner, please check your email for your digital ticket.
            </p>
          </div>

          <div className="space-y-3">
            {winners.map((winner) => (
              <div
                key={winner.ticketNumber}
                className="flex items-center justify-between rounded-lg border border-border bg-secondary/30 px-4 py-3 sm:px-6"
              >
                <div className="flex items-center gap-3">
                  <span className="font-mono text-lg font-bold text-foreground">#{winner.ticketNumber}</span>
                </div>
                <span
                  className={`text-sm font-medium ${
                    winner.status === "Canceled" ? "text-destructive" : "text-primary"
                  }`}
                >
                  {winner.status}
                </span>
              </div>
            ))}
          </div>

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

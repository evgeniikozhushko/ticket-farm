// import React from 'react'

// const page = () => {


//   return (
//     <div className='flex items-start justify-center min-h-screen'>
//        <div className='text-2xl m-auto'>Welcome to Tickety</div>
//     </div>
   
//   )
// }

// export default page

import Link from "next/link"
import { RegistrationForm } from "@/components/registration-form"

export default function HomePage() {
  const today = new Date().toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  })

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-2xl px-4 py-8 sm:px-6 lg:px-8">
        {/* Header */}
        <header className="mb-8 mt-14 text-center">
          <div className="mb-2 flex items-center justify-center gap-2">
            <h1 className="text-4xl font-bold text-foreground">Canmore Food Recovery Barn</h1>
          </div>
          <p className="text-med font-medium text-muted-foreground uppercaseb">Food Recovery Lottery</p>
        </header>

        {/* Main Card */}
        <div className="rounded-md bg-card p-6 shadow-lg sm:p-8 border mb-6">
          <div className="mb-10 space-y-2 text-center">
            <p className="text-sm font-medium text-muted-foreground">{today}</p>
            <h2 className="text-2xl font-bold text-balance text-foreground mb-8">Enter {"Today's"} Lottery</h2>
            <p className="text-pretty leading-relaxed text-muted-foreground">
              This is a daily lottery, not first-come-first-served. Pickup starts at 5:30 PM. If you are selected,{" "}
              {"you'll"} receive an email with your digital ticket.
            </p>
          </div>

          <RegistrationForm />

          <div className="mt-6 flex items-center justify-center gap-4 text-sm">
            <Link href="/winners" className="text-primary underline-offset-4 hover:underline">
              View {"today's"} winners
            </Link>
          </div>
        </div>

        {/* Today's Theme Badge */}
        <div className="mb-6 flex items-center justify-center gap-3 rounded-md bg-secondary p-4 border">
          <div className="text-6xl" role="img" aria-label="Strawberry">
            🍓
          </div>
          <div className="text-left">
            <p className="text-sm font-medium text-muted-foreground">{"Today's Theme"}</p>
            <p className="text-2xl font-bold text-foreground">Strawberry</p>
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

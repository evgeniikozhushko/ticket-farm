"use client"

import type React from "react"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Checkbox } from "@/components/ui/checkbox"
import { enterLottery } from '@/lib/actions/lottery.actions'

export function RegistrationForm() {
  const [name, setName] = useState("")
  const [email, setEmail] = useState("")
  const [consent, setConsent] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [isSubmitted, setIsSubmitted] = useState(false)
  const [error, setError] = useState("")

  // This Form to Use Server Actions
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsLoading(true)
  
    const formData = new FormData(e.target as HTMLFormElement)
    const result = await enterLottery(formData)
    
    if (result.success) {
      setIsSubmitted(true)
    } else {
      setError(result.error || 'An error occurred')
    }
    setIsLoading(false)
  }

  if (isSubmitted) {
    return (
      <div className="space-y-4 text-center">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
          <svg className="h-8 w-8 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <div className="space-y-2">
          <h3 className="text-xl font-bold text-foreground">
            {"You're"} entered in {"today's"} lottery!
          </h3>
          <p className="text-balance leading-relaxed text-muted-foreground">
            Results will be announced later today. If you are selected, {"you'll"} receive an email with your ticket and
            pickup time starting at 5:30 PM.
          </p>
          <p className="pt-4 text-sm text-muted-foreground">You can close this page now.</p>
        </div>
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="space-y-2">
        <Label htmlFor="name" className="text-sm font-medium">
          Name
        </Label>
        <Input
          id="name"
          name="name"
          type="text"
          placeholder="Enter your name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="h-12 text-base"
          required
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="email" className="text-sm font-medium">
          Email
        </Label>
        <Input
          id="email"
          name="email" 
          type="email"
          placeholder="your.email@example.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="h-12 text-base"
          required
        />
      </div>

      <div className="flex items-start gap-3 rounded-lg bg-secondary/50 p-4">
        <Checkbox
          id="consent"
          checked={consent}
          onCheckedChange={(checked) => setConsent(checked === true)}
          className="mt-0.5"
        />
        <label htmlFor="consent" className="cursor-pointer text-sm leading-relaxed text-foreground">
          I understand this is a lottery and not everyone will be selected.
        </label>
        <input type="hidden" name="consent" value={consent ? "true" : "false"} />
      </div>

      {error && <div className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive">{error}</div>}

      <Button type="submit" size="lg" className="h-14 w-full text-lg font-semibold border" disabled={isLoading}>
        {isLoading ? "Entering tickets..." : "Get today's ticket"}
      </Button>

      {/* <p className="text-center text-sm leading-relaxed text-muted-foreground">
        If you are selected, you will receive an email with your ticket and pickup time.
      </p> */}
    </form>
  )
}

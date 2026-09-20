"use client"

import type React from "react"

import { useEffect, useRef, useState } from "react"
import Script from "next/script"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Checkbox } from "@/components/ui/checkbox"
import { enterLottery } from '@/lib/actions/lottery.actions'

type TurnstileApi = {
  render: (container: HTMLElement, options: {
    sitekey: string
    action: string
    responseField: boolean
    callback: (token: string) => void
    'expired-callback': () => void
    'error-callback': () => void
    'timeout-callback': () => void
  }) => string
  reset: (widgetId: string) => void
  remove: (widgetId: string) => void
}

declare global {
  interface Window { turnstile?: TurnstileApi }
}

const siteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ?? ""

export function RegistrationForm({
  orgSlug,
  pickupTime,
}: {
  orgSlug: string
  pickupTime: string
}) {
  const [name, setName] = useState("")
  const [email, setEmail] = useState("")
  const [consent, setConsent] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [isSubmitted, setIsSubmitted] = useState(false)
  const [error, setError] = useState("")
  const [token, setToken] = useState("")
  const [scriptReady, setScriptReady] = useState(false)
  const widgetContainer = useRef<HTMLDivElement>(null)
  const widgetId = useRef<string | null>(null)

  useEffect(() => {
    if (!scriptReady || !siteKey || !widgetContainer.current || !window.turnstile) return
    const id = window.turnstile.render(widgetContainer.current, {
      sitekey: siteKey,
      action: "public_registration",
      responseField: false,
      callback: (value) => { setToken(value); setError("") },
      'expired-callback': () => {
        setToken("")
        setError("Security check expired. Please try again.")
        if (widgetId.current) window.turnstile?.reset(widgetId.current)
      },
      'error-callback': () => { setToken(""); setError("Security check failed. Please try again.") },
      'timeout-callback': () => {
        setToken("")
        setError("Security check timed out. Please try again.")
      },
    })
    widgetId.current = id
    return () => {
      window.turnstile?.remove(id)
      widgetId.current = null
    }
  }, [scriptReady])

  // This Form to Use Server Actions
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!token) {
      setError("Please complete the security check.")
      return
    }
    setIsLoading(true)
    setError("")

    try {
      const formData = new FormData(e.target as HTMLFormElement)
      formData.set("cf-turnstile-response", token)
      const result = await enterLottery(orgSlug, formData)
      if (result.success) {
        setIsSubmitted(true)
      } else {
        setError(result.error || 'An error occurred')
        setToken("")
        if (widgetId.current) window.turnstile?.reset(widgetId.current)
      }
    } catch {
      setError("Registration is currently unavailable. Please try again later.")
      setToken("")
      if (widgetId.current) window.turnstile?.reset(widgetId.current)
    } finally {
      setIsLoading(false)
    }
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
            After the draw, {"you'll"} receive your result by email whether or not you are selected. Winners receive their ticket and
            pickup time: {pickupTime}.
          </p>
          <p className="pt-4 text-sm text-muted-foreground">You can close this page now.</p>
        </div>
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {siteKey && <Script src="https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit" strategy="afterInteractive" onReady={() => setScriptReady(true)} onError={() => setError("Security check is unavailable. Please try again later.")} />}
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
          maxLength={120}
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
          maxLength={254}
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

      <div ref={widgetContainer} />
      {!siteKey && <p className="text-sm text-destructive">Security check is unavailable. Please try again later.</p>}

      {error && <div className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive">{error}</div>}

      <Button type="submit" size="lg" className="h-14 w-full text-lg font-semibold border" disabled={isLoading || !token}>
        {isLoading ? "Entering tickets..." : "Get today's ticket"}
      </Button>

      <p className="text-center text-sm leading-relaxed text-muted-foreground">
        Results are sent by email. Winner information is not published publicly.
        Organization staff can access your registration and draw information.
      </p>
    </form>
  )
}

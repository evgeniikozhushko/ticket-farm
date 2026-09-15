"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { lookupTicketReference, redeemTicketReference, type RedemptionResult } from "@/lib/actions/ticket-redemption.actions";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";

export function TicketRedemptionPanel() {
  const [reference, setReference] = useState("");
  const [result, setResult] = useState<RedemptionResult | null>(null);
  const [busy, setBusy] = useState(false);
  const router = useRouter();

  async function submit(redeem: boolean) {
    setBusy(true);
    try {
      const next = redeem && result && "ticket" in result
        ? await redeemTicketReference(result.ticket.ticketId)
        : await lookupTicketReference(reference);
      setResult(next);
      if (next.outcome === "redeemed") router.refresh();
    } catch {
      setResult({ outcome: "error", message: "Unable to complete this request. Check your organization access and try again." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Ticket pickup</CardTitle>
        <CardDescription>Ask the winner for their private Reference. A ticket number alone cannot be redeemed.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <form className="flex flex-col gap-3 sm:flex-row sm:items-end" onSubmit={(event) => { event.preventDefault(); void submit(false); }}>
          <div className="min-w-0 flex-1 space-y-2">
            <Label htmlFor="pickup-reference">Reference</Label>
            <Input id="pickup-reference" value={reference} disabled={busy} maxLength={32} autoComplete="off" autoCapitalize="characters" spellCheck={false}
              placeholder="Enter or scan Reference" onChange={(event) => { setReference(event.target.value); setResult(null); }} required />
          </div>
          <Button disabled={busy} type="submit">{busy ? "Checking…" : "Find ticket"}</Button>
        </form>
        <div aria-live="polite">
          {result && ("message" in result ? <p>{result.message}</p> : (
            <div className="space-y-2 rounded-lg border p-4">
              <p className="font-semibold">Ticket #{result.ticket.ticketNumber} — {result.ticket.name}</p>
              <p>Lottery date: {result.ticket.date} · Pickup time: {result.ticket.pickupTime}</p>
              {result.outcome === "active" && <Button disabled={busy} onClick={() => void submit(true)}>Redeem / Check In</Button>}
              {result.outcome === "redeemed" && <p>Ticket redeemed successfully.</p>}
              {result.outcome === "already_redeemed" && <p>This ticket has already been redeemed.</p>}
              {result.outcome === "inactive" && <p>This ticket is canceled or inactive and cannot be redeemed.</p>}
              {result.ticket.checkedInAt && <p>Checked in: {new Date(result.ticket.checkedInAt).toLocaleString()}</p>}
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

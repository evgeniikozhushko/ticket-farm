"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { cancelTicketReference, lookupTicketReference, redeemTicketReference, type RedemptionResult } from "@/lib/actions/ticket-redemption.actions";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";

export function TicketRedemptionPanel({ isAdmin }: { isAdmin: boolean }) {
  const [reference, setReference] = useState("");
  const [result, setResult] = useState<RedemptionResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmingCancellation, setConfirmingCancellation] = useState(false);
  const router = useRouter();

  async function submit(action: "lookup" | "redeem" | "cancel") {
    if (busy) return;
    setBusy(true);
    setConfirmingCancellation(false);
    try {
      let next: RedemptionResult;
      if (action === "lookup") {
        next = await lookupTicketReference(reference);
      } else {
        if (result?.outcome !== "active") return;
        const { ticketId } = result.ticket;
        next = action === "redeem"
          ? await redeemTicketReference(ticketId)
          : await cancelTicketReference(ticketId);
      }
      setResult(next);
      if (next.outcome === "redeemed" || next.outcome === "canceled") router.refresh();
    } catch {
      setResult({ outcome: "error", message: "Unable to complete this request. Check your organization access and try again." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="mx-4 min-w-0 lg:mx-6">
      <CardHeader>
        <CardTitle>Ticket pickup</CardTitle>
        <CardDescription>Ask the winner for their private Reference. A ticket number alone cannot be redeemed.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <form className="flex flex-col gap-3 sm:flex-row sm:items-end" onSubmit={(event) => { event.preventDefault(); void submit("lookup"); }}>
          <div className="min-w-0 flex-1 space-y-2">
            <Label htmlFor="pickup-reference">Reference</Label>
            <Input id="pickup-reference" value={reference} disabled={busy} maxLength={32} autoComplete="off" autoCapitalize="characters" spellCheck={false}
              placeholder="Enter or scan Reference" onChange={(event) => {
                setReference(event.target.value);
                setResult(null);
                setConfirmingCancellation(false);
              }} required />
          </div>
          <Button disabled={busy} type="submit">{busy ? "Checking…" : "Find ticket"}</Button>
        </form>
        <div aria-live="polite">
          {result && ("message" in result ? <p>{result.message}</p> : (
            <div className="space-y-2 rounded-lg border p-4">
              <p className="font-semibold">Ticket #{result.ticket.ticketNumber} — {result.ticket.name}</p>
              <p>Lottery date: {result.ticket.date} · Pickup time: {result.ticket.pickupTime}</p>
              {result.outcome === "active" && (
                <>
                  <p>Active</p>
                  {confirmingCancellation && isAdmin ? (
                    <div className="space-y-2">
                      <p>Cancel this ticket? It can no longer be checked in. Queued winner emails may still be sent.</p>
                      <div className="flex flex-wrap gap-2">
                        <Button variant="destructive" disabled={busy} onClick={() => void submit("cancel")}>Confirm cancellation</Button>
                        <Button variant="outline" disabled={busy} onClick={() => setConfirmingCancellation(false)}>Keep ticket</Button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex flex-wrap gap-2">
                      <Button disabled={busy} onClick={() => void submit("redeem")}>Redeem / Check In</Button>
                      {isAdmin && <Button variant="outline" disabled={busy} onClick={() => setConfirmingCancellation(true)}>Cancel ticket</Button>}
                    </div>
                  )}
                </>
              )}
              {result.outcome === "redeemed" && <p>Ticket redeemed successfully.</p>}
              {result.outcome === "already_redeemed" && <p>This ticket has already been redeemed.</p>}
              {result.outcome === "canceled" && <p>Ticket canceled successfully.</p>}
              {result.outcome === "already_canceled" && <p>This ticket is canceled and cannot be checked in.</p>}
              {result.ticket.checkedInAt && <p>Checked in: {new Date(result.ticket.checkedInAt).toLocaleString()}</p>}
              {result.ticket.canceledAt && <p>Canceled: {new Date(result.ticket.canceledAt).toLocaleString()}</p>}
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

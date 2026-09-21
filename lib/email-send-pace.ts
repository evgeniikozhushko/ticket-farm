import { getDb } from "@/lib/mongodb";

// Resend's documented default is 10 requests/second per team. A shared
// one-second slot leaves headroom for other API use and applies across workers.
export async function waitForResultEmailSendSlot() {
  const now = new Date();
  const slots = (await getDb()).collection<{ _id: string; nextAt: Date }>("result_email_send_pace");
  const reservation = await slots.findOneAndUpdate(
    { _id: "resend" },
    [{
      $set: {
        nextAt: {
          $dateAdd: {
            startDate: { $max: [{ $ifNull: ["$nextAt", now] }, now] },
            unit: "millisecond",
            amount: 1000,
          },
        },
      },
    }],
    { upsert: true, returnDocument: "after" }
  );
  if (!reservation) throw new Error("Could not reserve an email send slot.");
  const delay = reservation.nextAt.getTime() - 1000 - Date.now();
  if (delay > 0) await new Promise((resolve) => setTimeout(resolve, delay));
}

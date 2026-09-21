import { ObjectId } from "mongodb";
import { getRegistrantsCollection } from "@/lib/mongodb";
import { sendNonWinnerEmail, type NonWinnerEmail } from "@/lib/email";

// Recipients come exclusively from the committed draw outbox, never a fresh
// query for all registrations. Absence from this snapshot means no notification.
export async function sendNonWinnerNotifications(orgId: string, date: string, recipients: NonWinnerEmail[]) {
  const counts = { sent: 0, failed: 0, skipped: 0 };
  if (!recipients.length) return counts;
  const collection = await getRegistrantsCollection();
  for (const recipient of recipients) {
    const filter = { orgId, date, _id: new ObjectId(recipient.registrantId) };
    const current = await collection.findOne(filter);
    if (!current || current.nonWinnerEmailSent === true) {
      counts.skipped++;
      continue;
    }
    const result = await sendNonWinnerEmail(recipient);
    await collection.updateOne(
      { ...filter, nonWinnerEmailSent: { $ne: true } },
      result.success
        ? { $set: { nonWinnerEmailSent: true, nonWinnerEmailSentAt: new Date(),
            ...(result.messageId ? { nonWinnerEmailMessageId: result.messageId } : {}) }, $unset: { nonWinnerEmailError: "" } }
        : { $set: { nonWinnerEmailSent: false, nonWinnerEmailError: result.error ?? "Email send failed." } },
    );
    if (result.success) counts.sent++;
    else counts.failed++;
  }
  return counts;
}

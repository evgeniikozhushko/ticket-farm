import { ObjectId } from "mongodb";
import { beforeEach, expect, it, vi } from "vitest";
const collection = vi.hoisted(() => ({ findOne: vi.fn(), updateOne: vi.fn() }));
const send = vi.hoisted(() => vi.fn());
vi.mock("@/lib/mongodb", () => ({ getRegistrantsCollection: async () => collection }));
vi.mock("@/lib/email", () => ({ sendNonWinnerEmail: send }));
import { sendNonWinnerNotifications } from "@/lib/non-winner-notifications";
const recipient = { registrantId: new ObjectId().toString(), email: "ada@example.com", orgName: "Org", date: "2026-09-14", emailFromName: "Org", emailFromAddress: "hello@ticketfarm.ca" };
beforeEach(() => { vi.resetAllMocks(); });

it("sends only the saved recipient, scopes reads/writes, and records provider acceptance", async () => {
  collection.findOne.mockResolvedValue({ nonWinnerEmailSent: false });
  send.mockResolvedValue({ success: true });
  expect(await sendNonWinnerNotifications("org_a", recipient.date, [recipient])).toEqual({ sent: 1, failed: 0, skipped: 0 });
  expect(collection.findOne).toHaveBeenCalledWith({ orgId: "org_a", date: recipient.date, _id: new ObjectId(recipient.registrantId) });
  expect(collection.updateOne).toHaveBeenCalledWith(expect.objectContaining({ orgId: "org_a", nonWinnerEmailSent: { $ne: true } }), expect.objectContaining({ $set: { nonWinnerEmailSent: true, nonWinnerEmailSentAt: expect.any(Date) } }));
  expect(send).toHaveBeenCalledWith(recipient);
});
it.each([null, { nonWinnerEmailSent: true }])("skips missing or previously successful recipients", async (record) => {
  collection.findOne.mockResolvedValue(record);
  expect(await sendNonWinnerNotifications("org_a", recipient.date, [recipient])).toEqual({ sent: 0, failed: 0, skipped: 1 });
  expect(send).not.toHaveBeenCalled();
});
it("records failures for retry without overwriting concurrent success", async () => {
  collection.findOne.mockResolvedValue({});
  send.mockResolvedValue({ success: false, error: "Temporary failure" });
  expect(await sendNonWinnerNotifications("org_a", recipient.date, [recipient])).toEqual({ sent: 0, failed: 1, skipped: 0 });
  expect(collection.updateOne).toHaveBeenCalledWith(expect.objectContaining({ nonWinnerEmailSent: { $ne: true } }), { $set: { nonWinnerEmailSent: false, nonWinnerEmailError: "Temporary failure" } });
});
it("does not discover additional registrants when the snapshot is empty", async () => {
  expect(await sendNonWinnerNotifications("org_a", recipient.date, [])).toEqual({ sent: 0, failed: 0, skipped: 0 });
  expect(collection.findOne).not.toHaveBeenCalled();
});

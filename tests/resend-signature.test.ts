import { createHmac } from "node:crypto";
import { expect, it } from "vitest";
import { Resend } from "resend";

it("verifies existing Svix signatures after the Resend dependency refresh", () => {
  const key = Buffer.from("synthetic-test-signing-key");
  const webhookSecret = `whsec_${key.toString("base64")}`;
  const payload = JSON.stringify({ type: "email.delivered", data: { email_id: "synthetic" } });
  const id = "synthetic_event";
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const signature = `v1,${createHmac("sha256", key).update(`${id}.${timestamp}.${payload}`).digest("base64")}`;
  const resend = new Resend("re_synthetic_test_key");
  expect(resend.webhooks.verify({ payload, webhookSecret, headers: { id, timestamp, signature } }))
    .toEqual(JSON.parse(payload));
  expect(() => resend.webhooks.verify({ payload: `${payload} `, webhookSecret, headers: { id, timestamp, signature } }))
    .toThrow();
});

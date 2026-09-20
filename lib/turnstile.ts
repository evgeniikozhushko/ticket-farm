import { randomUUID } from "node:crypto";

const SITEVERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";
const ACTION = "public_registration";

type SiteverifyResponse = {
  success?: unknown;
  action?: unknown;
  hostname?: unknown;
  "error-codes"?: unknown;
};

export async function verifyRegistrationChallenge(token: string, ip: string): Promise<boolean> {
  const secret = process.env.TURNSTILE_SECRET_KEY?.trim();
  const hostnames = process.env.TURNSTILE_ALLOWED_HOSTNAMES?.split(",")
    .map((hostname) => hostname.trim().toLowerCase())
    .filter(Boolean);
  if (!secret || !hostnames?.length) return false;

  const idempotencyKey = randomUUID();
  const body = new URLSearchParams({
    secret,
    response: token,
    remoteip: ip,
    idempotency_key: idempotencyKey,
  });

  for (let attempt = 0; attempt < 2; attempt++) {
    let response: Response;
    try {
      response = await fetch(SITEVERIFY_URL, {
        method: "POST",
        body,
        signal: AbortSignal.timeout(3000),
      });
    } catch {
      // Network errors and timeouts may be retried with the same key.
      continue;
    }
    if (response.status >= 500) continue;
    if (!response.ok) return false;
    let result: SiteverifyResponse;
    try {
      result = (await response.json()) as SiteverifyResponse;
    } catch {
      return false;
    }
    if (
      result?.success === true &&
      result.action === ACTION &&
      typeof result.hostname === "string" &&
      hostnames.includes(result.hostname.toLowerCase())
    ) return true;

    if (
      result?.success === false &&
      Array.isArray(result["error-codes"]) &&
      result["error-codes"].includes("internal-error")
    ) continue;
    return false;
  }
  return false;
}

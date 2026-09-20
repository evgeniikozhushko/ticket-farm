import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { verifyRegistrationChallenge } from "@/lib/turnstile";

const valid = { success: true, action: "public_registration", hostname: "preview.ticketfarm.ca" };
const response = (body: unknown, status = 200) => ({
  ok: status >= 200 && status < 300,
  status,
  json: async () => body,
});

describe("registration Siteverify", () => {
  beforeEach(() => {
    process.env.TURNSTILE_SECRET_KEY = "secret";
    process.env.TURNSTILE_ALLOWED_HOSTNAMES = "ticketfarm.ca, preview.ticketfarm.ca";
  });
  afterEach(() => {
    delete process.env.TURNSTILE_SECRET_KEY;
    delete process.env.TURNSTILE_ALLOWED_HOSTNAMES;
    vi.unstubAllGlobals();
  });

  it("fails closed without a secret or exact hostname allowlist", async () => {
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    delete process.env.TURNSTILE_SECRET_KEY;
    expect(await verifyRegistrationChallenge("token", "203.0.113.1")).toBe(false);
    process.env.TURNSTILE_SECRET_KEY = "secret";
    process.env.TURNSTILE_ALLOWED_HOSTNAMES = "  ";
    expect(await verifyRegistrationChallenge("token", "203.0.113.1")).toBe(false);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("sends token, IP and UUID, and requires success, action and exact hostname", async () => {
    const fetch = vi.fn().mockResolvedValue(response(valid));
    vi.stubGlobal("fetch", fetch);
    expect(await verifyRegistrationChallenge("token", "203.0.113.1")).toBe(true);
    const [url, options] = fetch.mock.calls[0];
    expect(url).toBe("https://challenges.cloudflare.com/turnstile/v0/siteverify");
    expect(options.body.get("response")).toBe("token");
    expect(options.body.get("remoteip")).toBe("203.0.113.1");
    expect(options.body.get("idempotency_key")).toMatch(/^[0-9a-f-]{36}$/);
    expect(options.signal).toBeInstanceOf(AbortSignal);

    for (const body of [
      { ...valid, success: false, "error-codes": ["timeout-or-duplicate"] },
      { ...valid, action: "other" },
      { success: true, hostname: "example.com" },
      { ...valid, hostname: "evilpreview.ticketfarm.ca" },
      { ...valid, hostname: "ticketfarm.ca.evil.test" },
    ]) {
      fetch.mockResolvedValueOnce(response(body));
      expect(await verifyRegistrationChallenge("token", "203.0.113.1")).toBe(false);
    }
  });

  it.each([
    ["network failure", () => Promise.reject(new Error("offline"))],
    ["timeout", () => Promise.reject(new DOMException("timeout", "TimeoutError"))],
    ["server error", () => Promise.resolve(response({}, 503))],
    ["internal error", () => Promise.resolve(response({ success: false, "error-codes": ["internal-error"] }))],
  ])("retries %s with the same idempotency key", async (_name, first) => {
    const fetch = vi.fn().mockImplementationOnce(first).mockResolvedValueOnce(response(valid));
    vi.stubGlobal("fetch", fetch);
    expect(await verifyRegistrationChallenge("token", "203.0.113.1")).toBe(true);
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(fetch.mock.calls[0][1].body.get("idempotency_key"))
      .toBe(fetch.mock.calls[1][1].body.get("idempotency_key"));
  });

  it("does not retry definitive failures or invalid JSON", async () => {
    const fetch = vi.fn().mockResolvedValueOnce(response({}, 400))
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => { throw new Error("bad JSON"); } });
    vi.stubGlobal("fetch", fetch);
    expect(await verifyRegistrationChallenge("token", "203.0.113.1")).toBe(false);
    expect(await verifyRegistrationChallenge("token", "203.0.113.1")).toBe(false);
    expect(fetch).toHaveBeenCalledTimes(2);
  });
});

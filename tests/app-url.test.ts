import { afterEach, describe, expect, it, vi } from "vitest";

import { getAppUrl } from "@/lib/app-url";

describe("getAppUrl", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("allows http outside production", () => {
    vi.stubEnv("APP_URL", "http://localhost:3000/");
    vi.stubEnv("NODE_ENV", "development");

    expect(getAppUrl()).toBe("http://localhost:3000");
  });

  it("requires https in production", () => {
    vi.stubEnv("APP_URL", "http://ticketfarm.ca");
    vi.stubEnv("NODE_ENV", "production");

    expect(() => getAppUrl()).toThrow("APP_URL must use https in production.");
  });

  it("allows https in production", () => {
    vi.stubEnv("APP_URL", "https://ticketfarm.ca/");
    vi.stubEnv("NODE_ENV", "production");

    expect(getAppUrl()).toBe("https://ticketfarm.ca");
  });
});

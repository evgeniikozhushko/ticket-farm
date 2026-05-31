export function getAppUrl(): string {
  const appUrl = process.env.APP_URL?.trim();

  if (!appUrl) {
    throw new Error("APP_URL is required.");
  }

  let parsed: URL;
  try {
    parsed = new URL(appUrl);
  } catch {
    throw new Error("APP_URL must be an absolute URL.");
  }

  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    throw new Error("APP_URL must use http or https.");
  }

  return appUrl.replace(/\/+$/, "");
}

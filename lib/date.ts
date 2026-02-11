// lib/date.ts

/** Fallback timezone used before an org's timezone is known */
export const DEFAULT_TIMEZONE = "America/Edmonton";

/**
 * Returns today's date as "YYYY-MM-DD" in the given IANA timezone.
 * Defaults to America/Edmonton if no timezone is provided.
 */
export function getTodayDateString(timezone: string = DEFAULT_TIMEZONE): string {
  const now = new Date();

  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });

  const parts = formatter.formatToParts(now);
  const year = parts.find((p) => p.type === "year")?.value;
  const month = parts.find((p) => p.type === "month")?.value;
  const day = parts.find((p) => p.type === "day")?.value;

  if (!year || !month || !day) {
    throw new Error(`Failed to format date for timezone: ${timezone}`);
  }

  return `${year}-${month}-${day}`;
}

// lib/date.ts

export const CANMORE_TIMEZONE = "America/Edmonton";

/**
 * Returns today's date as "YYYY-MM-DD" in Canmore's timezone.
 */
export function getTodayDateString(): string {
  const now = new Date();

  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: CANMORE_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });

  // formatToParts gives us structured components we can safely recombine
  const parts = formatter.formatToParts(now);
  const year = parts.find((p) => p.type === "year")?.value;
  const month = parts.find((p) => p.type === "month")?.value;
  const day = parts.find((p) => p.type === "day")?.value;

  if (!year || !month || !day) {
    throw new Error("Failed to format Canmore date");
  }

  return `${year}-${month}-${day}`; // e.g. "2025-11-15"
}

const TZ = "America/Los_Angeles";

export function getTodaySheetTabName(): string {
  const now = new Date();
  const dayFormatter = new Intl.DateTimeFormat("en-US", { timeZone: TZ, weekday: "long" });
  const monthFormatter = new Intl.DateTimeFormat("en-US", { timeZone: TZ, month: "long" });
  const dayNumFormatter = new Intl.DateTimeFormat("en-US", { timeZone: TZ, day: "numeric" });

  const weekday = dayFormatter.format(now).toUpperCase();
  const month = monthFormatter.format(now).toUpperCase();
  const dayNum = dayNumFormatter.format(now).padStart(2, "0");

  return `${weekday} - ${month} ${dayNum}`;
}

export function getTodayDisplay(): string {
  const now = new Date();
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const parts = formatter.formatToParts(now);
  const year = parts.find((p) => p.type === "year")!.value;
  const month = parts.find((p) => p.type === "month")!.value;
  const day = parts.find((p) => p.type === "day")!.value;
  return `${month}/${day}/${year}`;
}

interface AppointmentRange {
  from: string;
  to: string;
  fromDisplay: string;
  toDisplay: string;
}

function getCalendarDateLA(date: Date): { year: number; month: number; day: number } {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const parts = formatter.formatToParts(date);
  return {
    year: Number(parts.find((part) => part.type === "year")!.value),
    month: Number(parts.find((part) => part.type === "month")!.value),
    day: Number(parts.find((part) => part.type === "day")!.value),
  };
}

function formatUtcCalendarDate(date: Date): { iso: string; display: string } {
  const year = String(date.getUTCFullYear()).padStart(4, "0");
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  return { iso: `${year}-${month}-${day}`, display: `${month}/${day}/${year}` };
}

export function getRollingAppointmentRangeLA(daysBefore = 7, daysAfter = 7, now = new Date()): AppointmentRange {
  const localDate = getCalendarDateLA(now);
  const anchor = new Date(Date.UTC(localDate.year, localDate.month - 1, localDate.day));
  const start = new Date(anchor);
  const end = new Date(anchor);
  start.setUTCDate(start.getUTCDate() - daysBefore);
  end.setUTCDate(end.getUTCDate() + daysAfter);

  const startDate = formatUtcCalendarDate(start);
  const endDate = formatUtcCalendarDate(end);
  return {
    from: `${startDate.iso}T00:00:00`,
    to: `${endDate.iso}T23:59:59`,
    fromDisplay: startDate.display,
    toDisplay: endDate.display,
  };
}

export function getTodayRangeLA(): { from: string; to: string; display: string } {
  const range = getRollingAppointmentRangeLA(0, 0);
  return { from: range.from, to: range.to, display: range.fromDisplay };
}

export function getYesterdayDateLA(): { date: Date; iso: string; display: string; mdy: string } {
  const now = new Date();
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const parts = formatter.formatToParts(now);
  const year = Number(parts.find((p) => p.type === "year")!.value);
  const month = Number(parts.find((p) => p.type === "month")!.value);
  const day = Number(parts.find((p) => p.type === "day")!.value);

  // Previous calendar day in LA: shift by one UTC day from the LA noon anchor
  const anchor = new Date(Date.UTC(year, month - 1, day, 12));
  anchor.setUTCDate(anchor.getUTCDate() - 1);
  const y = String(anchor.getUTCFullYear()).padStart(4, "0");
  const m = String(anchor.getUTCMonth() + 1).padStart(2, "0");
  const d = String(anchor.getUTCDate()).padStart(2, "0");

  return {
    date: anchor,
    iso: `${y}-${m}-${d}`,
    display: `${m}/${d}/${y}`,
    mdy: `${m}/${d}/${y}`,
  };
}

export function getSheetTabNameForDate(date: Date): string {
  const dayFormatter = new Intl.DateTimeFormat("en-US", { timeZone: TZ, weekday: "long" });
  const monthFormatter = new Intl.DateTimeFormat("en-US", { timeZone: TZ, month: "long" });
  const dayNumFormatter = new Intl.DateTimeFormat("en-US", { timeZone: TZ, day: "numeric" });

  const weekday = dayFormatter.format(date).toUpperCase();
  const month = monthFormatter.format(date).toUpperCase();
  const dayNum = dayNumFormatter.format(date).padStart(2, "0");

  return `${weekday} - ${month} ${dayNum}`;
}

/**
 * Normalize a yard-sheet date string (M/D/YYYY, M/D/YY, M.D.YY, M.D.YYYY) to
 * a comparable "YYYY-MM-DD" key, or null when not parseable.
 */
export function normalizeSheetDate(value: string): string | null {
  const raw = (value || "").trim();
  if (!raw) return null;
  const m = raw.match(/^(\d{1,2})[\/\.](\d{1,2})[\/\.](\d{2,4})$/);
  if (!m) return null;
  let year = Number(m[3]);
  if (year < 100) year += 2000;
  const month = Number(m[1]);
  const day = Number(m[2]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/**
 * Current time of day in America/Los_Angeles as minutes since midnight.
 */
export function getCurrentLATimeMinutes(now = new Date()): number {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: TZ,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const parts = formatter.formatToParts(now);
  const hour = Number(parts.find((p) => p.type === "hour")!.value) % 24;
  const minute = Number(parts.find((p) => p.type === "minute")!.value);
  return hour * 60 + minute;
}

/**
 * Parse a sheet appointment time like "8:00 AM" / "12:30 PM" into minutes
 * since midnight. Returns null when not parseable (e.g. date-like values).
 */
export function parseApptTimeToMinutes(value: string): number | null {
  const raw = (value || "").trim();
  if (!raw) return null;
  const m = raw.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if (!m) return null;
  let hour = Number(m[1]);
  const minute = Number(m[2]);
  const suffix = m[3].toUpperCase();
  if (suffix === "PM" && hour < 12) hour += 12;
  if (suffix === "AM" && hour === 12) hour = 0;
  if (hour > 23 || minute > 59) return null;
  return hour * 60 + minute;
}

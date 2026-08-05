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

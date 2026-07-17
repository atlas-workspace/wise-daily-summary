const TZ = "America/Los_Angeles";

export function getTodaySheetTabName(): string {
  const now = new Date();
  const dayFormatter = new Intl.DateTimeFormat("en-US", { timeZone: TZ, weekday: "long" });
  const monthFormatter = new Intl.DateTimeFormat("en-US", { timeZone: TZ, month: "long" });
  const dayNumFormatter = new Intl.DateTimeFormat("en-US", { timeZone: TZ, day: "numeric" });

  const weekday = dayFormatter.format(now).toUpperCase();
  const month = monthFormatter.format(now).toUpperCase();
  const dayNum = dayNumFormatter.format(now);

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

export function getTodayRangeLA(): { from: string; to: string; display: string } {
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

  return {
    from: `${year}-${month}-${day}T00:00:00`,
    to: `${year}-${month}-${day}T23:59:59`,
    display: `${month}/${day}/${year}`,
  };
}

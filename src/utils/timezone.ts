function partsFor(date: Date, timezone: string): Record<string, number> {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  });

  const result: Record<string, number> = {};
  for (const part of formatter.formatToParts(date)) {
    if (["year", "month", "day", "hour", "minute", "second"].includes(part.type)) {
      result[part.type] = Number(part.value);
    }
  }
  return result;
}

export function zonedDateTimeToUtc(date: string, time: string, timezone: string): Date {
  const [yearText, monthText, dayText] = date.split("-");
  const [hourText, minuteText] = time.split(":");
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const hour = Number(hourText);
  const minute = Number(minuteText);

  let guess = Date.UTC(year, month - 1, day, hour, minute, 0);
  for (let index = 0; index < 3; index += 1) {
    const actual = partsFor(new Date(guess), timezone);
    const actualAsUtc = Date.UTC(
      actual.year ?? year,
      (actual.month ?? month) - 1,
      actual.day ?? day,
      actual.hour ?? hour,
      actual.minute ?? minute,
      actual.second ?? 0,
    );
    const desiredAsUtc = Date.UTC(year, month - 1, day, hour, minute, 0);
    guess += desiredAsUtc - actualAsUtc;
  }
  return new Date(guess);
}

export function localDayOfWeek(date: string): number {
  const [yearText, monthText, dayText] = date.split("-");
  return new Date(Date.UTC(Number(yearText), Number(monthText) - 1, Number(dayText))).getUTCDay();
}

export function normalizePostalCode(value: string): string {
  return value.trim().toUpperCase().replace(/\s+/g, "");
}

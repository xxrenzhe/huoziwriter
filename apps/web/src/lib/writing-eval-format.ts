const WRITING_EVAL_DATE_TIME_FORMATTER = new Intl.DateTimeFormat("zh-CN", {
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hour12: false,
});

const WRITING_EVAL_MONTH_DAY_FORMATTER = new Intl.DateTimeFormat("zh-CN", {
  month: "2-digit",
  day: "2-digit",
});

export function formatWritingEvalMetric(
  value: number | null | undefined,
  suffixOrDigits: string | number = "",
  digits?: number,
) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "--";

  const suffix = typeof suffixOrDigits === "string" ? suffixOrDigits : "";
  const resolvedDigits =
    typeof suffixOrDigits === "number" ? suffixOrDigits : digits ?? (suffix ? 1 : 2);

  return `${value.toFixed(resolvedDigits)}${suffix}`;
}

export function formatWritingEvalDateTime(value: string | number | Date | null | undefined, fallback = "--") {
  if (!value) return fallback;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? fallback : WRITING_EVAL_DATE_TIME_FORMATTER.format(date);
}

export function formatWritingEvalMonthDay(value: string | number | Date | null | undefined, fallback = "--") {
  if (!value) return fallback;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? fallback : WRITING_EVAL_MONTH_DAY_FORMATTER.format(date);
}

export function getRecentDateBuckets(days: number, now = new Date()) {
  return Array.from({ length: days }, (_, index) => {
    const date = new Date(now);
    date.setHours(0, 0, 0, 0);
    date.setDate(date.getDate() - (days - index - 1));
    return date.toISOString().slice(0, 10);
  });
}

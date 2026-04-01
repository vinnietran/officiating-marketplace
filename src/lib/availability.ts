import type { UserProfile } from "../types";

const DATE_KEY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const MONTH_KEY_PATTERN = /^\d{4}-\d{2}$/;

export interface AvailabilityCalendarDay {
  dateKey: string;
  dayNumber: number;
  inCurrentMonth: boolean;
  isToday: boolean;
}

function isValidDateParts(year: number, monthIndex: number, day: number): boolean {
  const candidate = new Date(year, monthIndex, day);
  return (
    candidate.getFullYear() === year &&
    candidate.getMonth() === monthIndex &&
    candidate.getDate() === day
  );
}

export function normalizeAvailabilityDateKey(rawValue: string): string | null {
  const value = rawValue.trim();
  if (!DATE_KEY_PATTERN.test(value)) {
    return null;
  }

  const [yearPart, monthPart, dayPart] = value.split("-");
  const year = Number(yearPart);
  const monthIndex = Number(monthPart) - 1;
  const day = Number(dayPart);

  if (!Number.isInteger(year) || !Number.isInteger(monthIndex) || !Number.isInteger(day)) {
    return null;
  }

  return isValidDateParts(year, monthIndex, day) ? value : null;
}

export function getAvailabilityDateKeyFromDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function getAvailabilityDateKeyFromDateTimeLocal(
  rawDateTimeLocal: string
): string | null {
  const trimmed = rawDateTimeLocal.trim();
  if (trimmed.length < 10) {
    return null;
  }

  return normalizeAvailabilityDateKey(trimmed.slice(0, 10));
}

export function normalizeBlockedDateKeys(rawValues: string[]): string[] {
  return Array.from(
    new Set(rawValues.map((value) => normalizeAvailabilityDateKey(value) ?? "").filter(Boolean))
  ).sort((left, right) => left.localeCompare(right));
}

export function isOfficialBlockedOnDateKey(
  official: UserProfile,
  dateKey: string | null | undefined
): boolean {
  if (!dateKey) {
    return false;
  }

  return (official.availability?.blockedDateKeys ?? []).includes(dateKey);
}

export function getAvailabilityMonthKeyFromDate(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

export function shiftAvailabilityMonthKey(monthKey: string, offset: number): string {
  const trimmed = monthKey.trim();
  if (!MONTH_KEY_PATTERN.test(trimmed)) {
    return getAvailabilityMonthKeyFromDate(new Date());
  }

  const [yearPart, monthPart] = trimmed.split("-");
  const nextDate = new Date(Number(yearPart), Number(monthPart) - 1 + offset, 1);
  return getAvailabilityMonthKeyFromDate(nextDate);
}

export function formatAvailabilityMonthLabel(monthKey: string): string {
  const trimmed = monthKey.trim();
  if (!MONTH_KEY_PATTERN.test(trimmed)) {
    return "";
  }

  const [yearPart, monthPart] = trimmed.split("-");
  const date = new Date(Number(yearPart), Number(monthPart) - 1, 1);
  return new Intl.DateTimeFormat("en-US", {
    month: "long",
    year: "numeric"
  }).format(date);
}

export function buildAvailabilityCalendarDays(monthKey: string): AvailabilityCalendarDay[] {
  const trimmed = monthKey.trim();
  const todayKey = getAvailabilityDateKeyFromDate(new Date());

  if (!MONTH_KEY_PATTERN.test(trimmed)) {
    return [];
  }

  const [yearPart, monthPart] = trimmed.split("-");
  const year = Number(yearPart);
  const monthIndex = Number(monthPart) - 1;
  const firstDayOfMonth = new Date(year, monthIndex, 1);
  const firstGridDate = new Date(firstDayOfMonth);
  firstGridDate.setDate(firstDayOfMonth.getDate() - firstDayOfMonth.getDay());

  return Array.from({ length: 42 }, (_, index) => {
    const current = new Date(firstGridDate);
    current.setDate(firstGridDate.getDate() + index);
    const dateKey = getAvailabilityDateKeyFromDate(current);

    return {
      dateKey,
      dayNumber: current.getDate(),
      inCurrentMonth: current.getMonth() === monthIndex,
      isToday: dateKey === todayKey
    };
  });
}

export function formatAvailabilityDate(dateKey: string): string {
  const normalized = normalizeAvailabilityDateKey(dateKey);
  if (!normalized) {
    return dateKey;
  }

  const [yearPart, monthPart, dayPart] = normalized.split("-");
  const date = new Date(Number(yearPart), Number(monthPart) - 1, Number(dayPart));
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric"
  }).format(date);
}

import type { Game } from "../types";

export interface MarketplaceDateRange {
  startDate: string;
  endDate: string;
}

export function parseDateInputValue(value: string): Date | null {
  const trimmed = value.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    return null;
  }

  const [yearPart, monthPart, dayPart] = trimmed.split("-");
  const year = Number(yearPart);
  const month = Number(monthPart);
  const day = Number(dayPart);
  const candidate = new Date(year, month - 1, day);
  if (
    !Number.isInteger(year) ||
    !Number.isInteger(month) ||
    !Number.isInteger(day) ||
    candidate.getFullYear() !== year ||
    candidate.getMonth() !== month - 1 ||
    candidate.getDate() !== day
  ) {
    return null;
  }

  return candidate;
}

function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), 0, 0, 0, 0);
}

function endOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), 23, 59, 59, 999);
}

export function validateMarketplaceDateRange(range: Pick<MarketplaceDateRange, "startDate" | "endDate">): string | null {
  if (!range.startDate.trim() || !range.endDate.trim()) {
    return null;
  }

  const startDate = parseDateInputValue(range.startDate);
  const endDate = parseDateInputValue(range.endDate);
  if (!startDate || !endDate) {
    return "Enter a valid date range.";
  }

  if (endDate.getTime() < startDate.getTime()) {
    return "End date cannot be before start date.";
  }

  return null;
}
export function isGameWithinMarketplaceDateRange(
  game: Pick<Game, "dateISO">,
  range: Pick<MarketplaceDateRange, "startDate" | "endDate">
): boolean {
  const gameDate = new Date(game.dateISO);
  if (Number.isNaN(gameDate.getTime())) {
    return false;
  }

  const startDate = range.startDate ? parseDateInputValue(range.startDate) : null;
  const endDate = range.endDate ? parseDateInputValue(range.endDate) : null;
  if (range.startDate && !startDate) {
    return true;
  }
  if (range.endDate && !endDate) {
    return true;
  }

  if (startDate && gameDate.getTime() < startOfDay(startDate).getTime()) {
    return false;
  }
  if (endDate && gameDate.getTime() > endOfDay(endDate).getTime()) {
    return false;
  }

  return true;
}

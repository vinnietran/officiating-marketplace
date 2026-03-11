import type { Level, Sport } from "../types";

export interface MarketplaceGameSubmission {
  schoolName: string;
  sport: Sport;
  level: Level;
  dateISO: string;
  acceptingBidsUntilISO?: string;
  location: string;
  payPosted: number;
  notes?: string;
}

export interface MarketplaceGameFormInput {
  schoolName: string;
  sport: Sport;
  level: Level;
  dateLocal: string;
  acceptingBidsUntilLocal?: string;
  location: string;
  payPosted: string;
  notes: string;
}

export function toDateTimeLocalValue(dateISO?: string): string {
  if (!dateISO) {
    return "";
  }

  const date = new Date(dateISO);
  if (Number.isNaN(date.getTime())) {
    return "";
  }

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");

  return `${year}-${month}-${day}T${hours}:${minutes}`;
}

export function buildMarketplaceGameSubmission(
  input: MarketplaceGameFormInput
): MarketplaceGameSubmission {
  const parsedPay = Number(input.payPosted);
  const gameDate = new Date(input.dateLocal);
  const bidsUntilDate = input.acceptingBidsUntilLocal
    ? new Date(input.acceptingBidsUntilLocal)
    : null;

  if (!input.schoolName.trim() || !input.location.trim()) {
    throw new Error("School and location are required.");
  }

  if (!input.dateLocal || Number.isNaN(gameDate.getTime())) {
    throw new Error("A valid game date and time is required.");
  }

  if (
    bidsUntilDate &&
    (Number.isNaN(bidsUntilDate.getTime()) ||
      bidsUntilDate.getTime() > gameDate.getTime())
  ) {
    throw new Error("Accepting bids until must be a valid date/time before game start.");
  }

  if (!Number.isFinite(parsedPay) || parsedPay <= 0) {
    throw new Error("Posted pay must be greater than 0.");
  }

  return {
    schoolName: input.schoolName.trim(),
    sport: input.sport,
    level: input.level,
    dateISO: gameDate.toISOString(),
    acceptingBidsUntilISO: bidsUntilDate ? bidsUntilDate.toISOString() : undefined,
    location: input.location.trim(),
    payPosted: parsedPay,
    notes: input.notes.trim() || undefined
  };
}

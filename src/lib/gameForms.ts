import type { Level, Sport } from "../types";
import {
  MAX_REQUESTED_CREW_SIZE,
  MIN_REQUESTED_CREW_SIZE,
  isValidRequestedCrewSize
} from "./crewSize";
import { buildBidRangeSubmission } from "./bidRange";

export interface MarketplaceGameSubmission {
  schoolName: string;
  sport: Sport;
  level: Level;
  requestedCrewSize: number;
  dateISO: string;
  scheduledDateKey: string;
  acceptingBidsUntilISO?: string;
  location: string;
  payPosted: number;
  minBidAmount?: number;
  maxBidAmount?: number;
  notes?: string;
}

export interface MarketplaceGameFormInput {
  schoolName: string;
  sport: Sport;
  level: Level;
  requestedCrewSize: string;
  dateLocal: string;
  acceptingBidsUntilLocal?: string;
  location: string;
  payPosted: string;
  minBidAmount: string;
  maxBidAmount: string;
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
  const crewSizeValue = input.requestedCrewSize.trim();
  const parsedCrewSize = crewSizeValue === "" ? null : Number(crewSizeValue);
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

  if (parsedCrewSize === null) {
    throw new Error("Crew size needed is required.");
  }

  if (!isValidRequestedCrewSize(parsedCrewSize)) {
    throw new Error(
      `Crew size needed must be a whole number from ${MIN_REQUESTED_CREW_SIZE} to ${MAX_REQUESTED_CREW_SIZE}.`
    );
  }

  const bidRange = buildBidRangeSubmission({
    minBidAmount: input.minBidAmount,
    maxBidAmount: input.maxBidAmount
  });

  return {
    schoolName: input.schoolName.trim(),
    sport: input.sport,
    level: input.level,
    requestedCrewSize: parsedCrewSize,
    dateISO: gameDate.toISOString(),
    scheduledDateKey: input.dateLocal.slice(0, 10),
    acceptingBidsUntilISO: bidsUntilDate ? bidsUntilDate.toISOString() : undefined,
    location: input.location.trim(),
    payPosted: parsedPay,
    ...(typeof bidRange.minBidAmount === "number"
      ? { minBidAmount: bidRange.minBidAmount }
      : {}),
    ...(typeof bidRange.maxBidAmount === "number"
      ? { maxBidAmount: bidRange.maxBidAmount }
      : {}),
    notes: input.notes.trim() || undefined
  };
}

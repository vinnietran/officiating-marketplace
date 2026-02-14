import type { Bid } from "../types";

const BIDS_STORAGE_KEY = "officiatingMarketplace.bids.v1";

export function loadBids(): Bid[] {
  try {
    const raw = localStorage.getItem(BIDS_STORAGE_KEY);
    if (!raw) {
      return [];
    }

    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed.filter(isBidLike);
  } catch {
    return [];
  }
}

export function saveBids(bids: Bid[]): void {
  localStorage.setItem(BIDS_STORAGE_KEY, JSON.stringify(bids));
}

function isBidLike(value: unknown): value is Bid {
  if (!value || typeof value !== "object") {
    return false;
  }

  const maybeBid = value as Partial<Bid>;
  return (
    typeof maybeBid.id === "string" &&
    typeof maybeBid.gameId === "string" &&
    typeof maybeBid.officialName === "string" &&
    typeof maybeBid.amount === "number" &&
    typeof maybeBid.createdAtISO === "string"
  );
}

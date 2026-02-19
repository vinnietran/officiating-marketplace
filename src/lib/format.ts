export function formatGameDate(dateISO: string): string {
  const date = new Date(dateISO);
  if (Number.isNaN(date.getTime())) {
    return "Invalid date";
  }

  const dayPart = new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric"
  }).format(date);

  const timePart = new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit"
  }).format(date);

  return `${dayPart} • ${timePart}`;
}

export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0
  }).format(amount);
}

export type BidWindowState = "open" | "closing" | "closed" | "unset";

export interface BidWindowInfo {
  label: string;
  state: BidWindowState;
}

export type GameMode = "marketplace" | "direct_assignment";

export function getBidWindowInfo(
  acceptingBidsUntilISO: string | undefined,
  status: "open" | "awarded",
  nowMs: number = Date.now()
): BidWindowInfo {
  if (status === "awarded") {
    return { label: "Closed (awarded)", state: "closed" };
  }

  if (!acceptingBidsUntilISO) {
    return { label: "Open (no close time set)", state: "unset" };
  }

  const closingDate = new Date(acceptingBidsUntilISO);
  if (Number.isNaN(closingDate.getTime())) {
    return { label: "Invalid close time", state: "closed" };
  }

  const remainingMs = closingDate.getTime() - nowMs;
  if (remainingMs <= 0) {
    return { label: "Closed", state: "closed" };
  }

  const totalMinutes = Math.ceil(remainingMs / 60000);
  const days = Math.floor(totalMinutes / (60 * 24));
  const hours = Math.floor((totalMinutes % (60 * 24)) / 60);
  const minutes = totalMinutes % 60;

  const state: BidWindowState = remainingMs <= 6 * 60 * 60 * 1000 ? "closing" : "open";

  if (days > 0) {
    return { label: `${days}d ${hours}h left`, state };
  }
  if (hours > 0) {
    return { label: `${hours}h ${minutes}m left`, state };
  }
  return { label: `${minutes}m left`, state };
}

export function getGameStatusLabel(
  status: "open" | "awarded",
  mode?: GameMode
): string {
  if (mode === "direct_assignment") {
    return "Assigned";
  }

  return status === "awarded" ? "Awarded" : "Open";
}

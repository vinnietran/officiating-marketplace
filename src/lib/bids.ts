import type { Bid, Crew, Game } from "../types";

export function requiresCrewBidForGame(game: Pick<Game, "level">): boolean {
  return game.level === "Varsity";
}

export function isCrewMember(
  crew: Pick<Crew, "memberUids" | "createdByUid" | "crewChiefUid">,
  userId: string
): boolean {
  return (
    crew.memberUids.includes(userId) ||
    crew.createdByUid === userId ||
    crew.crewChiefUid === userId
  );
}

export function getCrewRefereeOfficialId(
  crew: Pick<Crew, "refereeOfficialId" | "memberPositions">
): string | null {
  if (crew.refereeOfficialId?.trim()) {
    return crew.refereeOfficialId;
  }

  const refereeEntries = Object.entries(crew.memberPositions).filter(
    ([, position]) => position === "R"
  );
  if (refereeEntries.length !== 1) {
    return null;
  }

  return refereeEntries[0][0] || null;
}

export function canBidWithCrew(
  crew: Pick<Crew, "refereeOfficialId" | "memberPositions">,
  userId: string
): boolean {
  return getCrewRefereeOfficialId(crew) === userId;
}

export function getCrewMemberCrews(crews: Crew[], userId: string): Crew[] {
  return crews.filter((crew) => isCrewMember(crew, userId));
}

export function getBidEligibleCrews(crews: Crew[], userId: string): Crew[] {
  return crews.filter((crew) => canBidWithCrew(crew, userId));
}

export function findActiveBid(input: {
  bidderType: "individual" | "crew";
  existingBids: Bid[];
  selectedCrewId: string;
  singleBidMode: boolean;
}): Bid | null {
  const individualBid =
    input.existingBids.find((bid) => !bid.bidderType || bid.bidderType === "individual") ?? null;

  const crewBidsByCrewId = new Map<string, Bid>();
  input.existingBids.forEach((bid) => {
    if (bid.bidderType === "crew" && bid.crewId && !crewBidsByCrewId.has(bid.crewId)) {
      crewBidsByCrewId.set(bid.crewId, bid);
    }
  });

  const latestExistingBid =
    [...input.existingBids].sort((a, b) => b.createdAtISO.localeCompare(a.createdAtISO))[0] ??
    null;

  if (input.singleBidMode) {
    return latestExistingBid;
  }

  return input.bidderType === "crew"
    ? crewBidsByCrewId.get(input.selectedCrewId) ?? null
    : individualBid;
}

export function getBidFormDefaults(postedPay: number, activeBid: Bid | null): {
  amount: string;
  message: string;
} {
  if (activeBid) {
    return {
      amount: String(Math.max(activeBid.amount + 1, postedPay)),
      message: activeBid.message ?? ""
    };
  }

  return {
    amount: String(postedPay),
    message: ""
  };
}

export function buildBidSubmission(input: {
  officialName: string;
  bidderType: "individual" | "crew";
  selectedCrewId: string;
  amount: string;
  message: string;
  activeBid: Bid | null;
  availableCrews: Crew[];
  requiresCrewBid?: boolean;
}): {
  officialName: string;
  bidderType: "individual" | "crew";
  crewId?: string;
  crewName?: string;
  amount: number;
  message?: string;
} {
  const trimmedName = input.officialName.trim();
  const numericAmount = Number(input.amount);

  if (!trimmedName) {
    throw new Error("Official name is required.");
  }

  if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
    throw new Error("Bid amount must be greater than 0.");
  }

  if (input.message.length > 200) {
    throw new Error("Message cannot exceed 200 characters.");
  }

  if (input.requiresCrewBid && input.bidderType !== "crew") {
    throw new Error("Varsity games require crew bids.");
  }

  if (input.bidderType === "crew" && !input.selectedCrewId) {
    throw new Error("Select a crew to submit a crew bid.");
  }

  if (input.activeBid && numericAmount <= input.activeBid.amount) {
    throw new Error("New offer must be higher than your current bid.");
  }

  const activeCrew =
    input.bidderType === "crew"
      ? input.availableCrews.find((crew) => crew.id === input.selectedCrewId) ?? null
      : null;

  return {
    officialName: trimmedName,
    bidderType: input.bidderType,
    crewId: input.bidderType === "crew" ? input.selectedCrewId : undefined,
    crewName: input.bidderType === "crew" ? activeCrew?.name : undefined,
    amount: numericAmount,
    message: input.message.trim() || undefined
  };
}

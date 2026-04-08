import type { Crew, CrewRosterOfficial } from "../types";

export const MIN_REQUESTED_CREW_SIZE = 2;
export const MAX_REQUESTED_CREW_SIZE = 11;

export function getRequestedCrewSizeRequirement(requestedCrewSize?: number | null): number | null {
  if (
    typeof requestedCrewSize !== "number" ||
    !Number.isFinite(requestedCrewSize) ||
    !Number.isInteger(requestedCrewSize) ||
    requestedCrewSize <= 0
  ) {
    return null;
  }

  return requestedCrewSize;
}

export function isValidRequestedCrewSize(requestedCrewSize: number): boolean {
  return (
    Number.isInteger(requestedCrewSize) &&
    requestedCrewSize >= MIN_REQUESTED_CREW_SIZE &&
    requestedCrewSize <= MAX_REQUESTED_CREW_SIZE
  );
}

export function getRequestedCrewSizeLabel(requestedCrewSize: number): string {
  return `${requestedCrewSize} official${requestedCrewSize === 1 ? "" : "s"}`;
}

export function buildRequestedCrewSizeOptions(): Array<{ value: string; label: string }> {
  return Array.from(
    { length: MAX_REQUESTED_CREW_SIZE - MIN_REQUESTED_CREW_SIZE + 1 },
    (_, index) => {
      const size = MIN_REQUESTED_CREW_SIZE + index;
      return {
        value: String(size),
        label: getRequestedCrewSizeLabel(size)
      };
    }
  );
}

export function getCrewMemberCount(crew: Pick<Crew, "memberUids" | "members">): number {
  return new Set([
    ...crew.memberUids,
    ...crew.members.map((member) => member.uid)
  ]).size;
}

export function crewMeetsRequestedCrewSize(
  crew: Pick<Crew, "memberUids" | "members">,
  requestedCrewSize?: number | null
): boolean {
  const minimumCrewSize = getRequestedCrewSizeRequirement(requestedCrewSize);
  if (!minimumCrewSize) {
    return true;
  }

  return getCrewMemberCount(crew) >= minimumCrewSize;
}

export function getRosterOfficialCount(proposedRoster?: CrewRosterOfficial[]): number {
  if (!proposedRoster?.length) {
    return 0;
  }

  return new Set(
    proposedRoster
      .map((official) => official.officialUid.trim())
      .filter(Boolean)
  ).size;
}

export function rosterMeetsRequestedCrewSize(
  proposedRoster: CrewRosterOfficial[] | undefined,
  requestedCrewSize?: number | null
): boolean {
  const minimumCrewSize = getRequestedCrewSizeRequirement(requestedCrewSize);
  if (!minimumCrewSize) {
    return true;
  }

  return getRosterOfficialCount(proposedRoster) >= minimumCrewSize;
}

export function getEligibleBidCrewsForRequestedCrewSize(
  crews: Crew[],
  requestedCrewSize?: number | null
): Crew[] {
  return crews.filter((crew) => crewMeetsRequestedCrewSize(crew, requestedCrewSize));
}

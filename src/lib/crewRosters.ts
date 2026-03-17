import type { Bid, Crew, CrewRosterOfficial, FootballPosition, Game } from "../types";

export const DEFAULT_GAME_CONFLICT_WINDOW_MINUTES = 180;
export const FOOTBALL_GAME_POSITION_VALUES: Array<FootballPosition | ""> = [
  "",
  "R",
  "U",
  "C",
  "H",
  "L",
  "S",
  "F",
  "B",
  "RO",
  "RC",
  "ALT"
];

export interface RosterConflict {
  officialUid: string;
  conflictingGameId: string;
  conflictingStartISO: string;
  conflictingEndISO: string;
}

export function getCrewDefaultRoster(crew: Crew): CrewRosterOfficial[] {
  return crew.members.map((member) => ({
    officialUid: member.uid,
    officialName: member.name,
    officialEmail: member.email,
    role: crew.memberPositions[member.uid],
    source: "baseCrew",
    baseCrewMember: true
  }));
}

export function dedupeRoster(officials: CrewRosterOfficial[]): CrewRosterOfficial[] {
  const seen = new Set<string>();

  return officials.filter((official) => {
    if (!official.officialUid || seen.has(official.officialUid)) {
      return false;
    }

    seen.add(official.officialUid);
    return true;
  });
}

export function findDuplicateRosterOfficialIds(officials: CrewRosterOfficial[]): string[] {
  const counts = new Map<string, number>();

  officials.forEach((official) => {
    const uid = official.officialUid.trim();
    if (!uid) {
      return;
    }

    counts.set(uid, (counts.get(uid) ?? 0) + 1);
  });

  return Array.from(counts.entries())
    .filter(([, count]) => count > 1)
    .map(([uid]) => uid);
}

export function getAvailableFootballPositionsForRoster(
  officials: CrewRosterOfficial[],
  officialUid: string
): Array<FootballPosition | ""> {
  const assignedPositions = new Set(
    officials
      .filter((official) => official.officialUid !== officialUid)
      .map((official) => official.role)
      .filter((position): position is FootballPosition => Boolean(position))
  );
  const currentPosition =
    officials.find((official) => official.officialUid === officialUid)?.role ?? "";

  return FOOTBALL_GAME_POSITION_VALUES.filter(
    (position) => position === "" || position === currentPosition || !assignedPositions.has(position)
  );
}

export function getGameWindow(
  game: Pick<Game, "dateISO">,
  durationMinutes = DEFAULT_GAME_CONFLICT_WINDOW_MINUTES
): { startMs: number; endMs: number } | null {
  const startMs = new Date(game.dateISO).getTime();
  if (Number.isNaN(startMs)) {
    return null;
  }

  return {
    startMs,
    endMs: startMs + durationMinutes * 60 * 1000
  };
}

export function gamesOverlap(
  left: Pick<Game, "dateISO">,
  right: Pick<Game, "dateISO">,
  durationMinutes = DEFAULT_GAME_CONFLICT_WINDOW_MINUTES
): boolean {
  const leftWindow = getGameWindow(left, durationMinutes);
  const rightWindow = getGameWindow(right, durationMinutes);
  if (!leftWindow || !rightWindow) {
    return false;
  }

  return leftWindow.startMs < rightWindow.endMs && rightWindow.startMs < leftWindow.endMs;
}

export function getBidRosterOfficialIds(bid: Bid): string[] {
  if (bid.bidderType === "crew" && bid.proposedRoster?.length) {
    return bid.proposedRoster.map((official) => official.officialUid);
  }

  return bid.officialUid ? [bid.officialUid] : [];
}

export function getAssignedOfficialIds(game: Game, selectedBid: Bid | null): string[] {
  if (game.assignedOfficials?.length) {
    return game.assignedOfficials.map((official) => official.officialUid);
  }

  if (game.mode === "direct_assignment") {
    return (game.directAssignments ?? []).flatMap((assignment) =>
      assignment.assignmentType === "individual"
        ? [assignment.officialUid]
        : assignment.memberUids
    );
  }

  if (selectedBid) {
    return getBidRosterOfficialIds(selectedBid);
  }

  return [];
}

export function getAssignedOfficialPosition(
  game: Game,
  selectedBid: Bid | null,
  officialUid: string
): FootballPosition | undefined {
  if (game.assignedOfficials?.length) {
    return game.assignedOfficials.find((official) => official.officialUid === officialUid)?.role;
  }

  if (selectedBid?.proposedRoster?.length) {
    return selectedBid.proposedRoster.find((official) => official.officialUid === officialUid)?.role;
  }

  return undefined;
}

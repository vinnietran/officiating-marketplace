import type { Bid, Crew, FootballPosition, Game } from "../types";

const FOOTBALL_POSITION_LABELS: Record<FootballPosition, string> = {
  R: "Referee",
  U: "Umpire",
  C: "Center Judge",
  H: "Head Line Judge",
  L: "Line Judge",
  S: "Side Judge",
  F: "Field Judge",
  B: "Back Judge",
  RO: "Replay Official",
  RC: "Replay Communicator",
  ALT: "Alternate"
};

export function isOfficialAssignedToDirectGame(game: Game, officialUid: string): boolean {
  if (game.mode !== "direct_assignment") {
    return false;
  }

  return (game.directAssignments ?? []).some((assignment) => {
    if (assignment.assignmentType === "individual") {
      return assignment.officialUid === officialUid;
    }
    return assignment.memberUids.includes(officialUid);
  });
}

export function isOfficialAssignedToAwardedMarketplaceGame(
  selectedBid: Bid | null,
  crewsById: Map<string, Crew>,
  officialUid: string
): boolean {
  if (!selectedBid) {
    return false;
  }

  if (selectedBid.officialUid === officialUid) {
    return true;
  }

  if (selectedBid.bidderType !== "crew" || !selectedBid.crewId) {
    return false;
  }

  const awardedCrew = crewsById.get(selectedBid.crewId);
  if (!awardedCrew) {
    return false;
  }

  return awardedCrew.memberUids.includes(officialUid);
}

export function getBidderName(bid: Bid | null): string {
  if (!bid) {
    return "-";
  }
  if (bid.bidderType === "crew" && bid.crewName) {
    return `${bid.crewName} (Crew)`;
  }
  return bid.officialName;
}

export function getDirectAssignmentLabel(game: Game): string {
  const assignments = game.directAssignments ?? [];
  if (assignments.length === 0) {
    return "-";
  }

  if (assignments.length === 1) {
    const assignment = assignments[0];
    if (assignment.assignmentType === "crew") {
      return `${assignment.crewName} (Crew)`;
    }
    return assignment.officialName;
  }

  return `${assignments.length} assignees`;
}

export function toPositionLabel(position?: FootballPosition): string {
  if (!position) {
    return "Unassigned";
  }
  return `${FOOTBALL_POSITION_LABELS[position]} (${position})`;
}

export function getOfficialAssignmentDetails(
  game: Game,
  selectedBid: Bid | null,
  crewsById: Map<string, Crew>,
  officialUid: string
): { crewLabel: string; positionLabel: string } {
  if (game.mode === "direct_assignment") {
    const assignment = (game.directAssignments ?? []).find((candidate) => {
      if (candidate.assignmentType === "individual") {
        return candidate.officialUid === officialUid;
      }
      return candidate.memberUids.includes(officialUid);
    });

    if (!assignment) {
      return { crewLabel: "Assigned", positionLabel: "Unassigned" };
    }
    if (assignment.assignmentType === "crew") {
      const assignedCrew = crewsById.get(assignment.crewId);
      return {
        crewLabel: assignment.crewName,
        positionLabel: toPositionLabel(assignedCrew?.memberPositions?.[officialUid])
      };
    }
    return {
      crewLabel: "Individual",
      positionLabel: toPositionLabel(assignment.position)
    };
  }

  if (!selectedBid) {
    return { crewLabel: "Assigned", positionLabel: "Unassigned" };
  }
  if (selectedBid.bidderType === "crew") {
    const awardedCrew = selectedBid.crewId ? crewsById.get(selectedBid.crewId) : null;
    return {
      crewLabel: selectedBid.crewName ?? "Crew",
      positionLabel: toPositionLabel(awardedCrew?.memberPositions?.[officialUid])
    };
  }
  return { crewLabel: "Individual", positionLabel: "Unassigned" };
}

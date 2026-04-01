import type { Crew, FootballPosition, Level, Sport, UserProfile } from "../types";

export interface IndividualAssignee {
  officialUid: string;
  officialName: string;
  officialEmail: string;
  position: FootballPosition;
}

export interface AssignGameSubmission {
  schoolName: string;
  sport: Sport;
  level: Level;
  dateISO: string;
  scheduledDateKey: string;
  location: string;
  payPosted: number;
  notes?: string;
  directAssignments: Array<
    | {
        assignmentType: "individual";
        officialUid: string;
        officialName: string;
        officialEmail: string;
        position?: FootballPosition;
      }
    | {
        assignmentType: "crew";
        crewId: string;
        crewName: string;
        memberUids: string[];
        memberNames: string[];
      }
  >;
}

const FOOTBALL_POSITION_LABEL_BY_CODE: Record<FootballPosition, string> = {
  R: "Referee (R)",
  U: "Umpire (U)",
  C: "Center Judge (C)",
  H: "Head Line Judge (H)",
  L: "Line Judge (L)",
  S: "Side Judge (S)",
  F: "Field Judge (F)",
  B: "Back Judge (B)",
  RO: "Replay Official (RO)",
  RC: "Replay Communicator (RC)",
  ALT: "Alternate (ALT)"
};

export function filterAssignableOfficials(
  availableOfficials: UserProfile[],
  rawSearchTerm: string
): UserProfile[] {
  const searchTerm = rawSearchTerm.trim().toLowerCase();
  if (!searchTerm) {
    return [];
  }

  return availableOfficials
    .filter(
      (official) =>
        official.displayName.toLowerCase().includes(searchTerm) ||
        official.email.toLowerCase().includes(searchTerm)
    )
    .slice(0, 30);
}

export function getCrewMemberPositionLabel(crew: Crew, memberUid: string): string {
  const positionCode = crew.memberPositions[memberUid];
  if (!positionCode) {
    return "Unassigned";
  }

  return FOOTBALL_POSITION_LABEL_BY_CODE[positionCode] ?? positionCode;
}

export function buildAssignedGameSubmission(input: {
  schoolName: string;
  sport: Sport;
  level: Level;
  dateLocal: string;
  location: string;
  payPosted: string;
  notes: string;
  individualAssignments: IndividualAssignee[];
  selectedCrews: Crew[];
}): AssignGameSubmission {
  const parsedPay = Number(input.payPosted);
  const gameDate = new Date(input.dateLocal);

  if (!input.schoolName.trim() || !input.location.trim()) {
    throw new Error("School and location are required.");
  }

  if (!input.dateLocal || Number.isNaN(gameDate.getTime())) {
    throw new Error("A valid game date and time is required.");
  }

  if (!Number.isFinite(parsedPay) || parsedPay <= 0) {
    throw new Error("Game fee must be greater than 0.");
  }

  if (input.individualAssignments.length === 0 && input.selectedCrews.length === 0) {
    throw new Error("Add at least one individual or one crew.");
  }

  if (input.sport === "Football") {
    const missingPosition = input.individualAssignments.some((assignee) => !assignee.position);
    if (missingPosition) {
      throw new Error("Each football official assignment requires a position.");
    }
  }

  return {
    schoolName: input.schoolName.trim(),
    sport: input.sport,
    level: input.level,
    dateISO: gameDate.toISOString(),
    scheduledDateKey: input.dateLocal.slice(0, 10),
    location: input.location.trim(),
    payPosted: parsedPay,
    notes: input.notes.trim() || undefined,
    directAssignments: [
      ...input.individualAssignments.map((assignee) => ({
        assignmentType: "individual" as const,
        officialUid: assignee.officialUid,
        officialName: assignee.officialName,
        officialEmail: assignee.officialEmail,
        ...(input.sport === "Football" ? { position: assignee.position } : {})
      })),
      ...input.selectedCrews.map((crew) => ({
        assignmentType: "crew" as const,
        crewId: crew.id,
        crewName: crew.name,
        memberUids: crew.memberUids,
        memberNames: crew.members.map((member) => member.name)
      }))
    ]
  };
}

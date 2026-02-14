export type Sport = "Football" | "Basketball" | "Soccer" | "Baseball";

export type Level = "Youth" | "Middle School" | "Varsity" | "College";

export type UserRole = "official" | "assignor" | "school";

export type GameStatus = "open" | "awarded";
export type CrewOwnerRole = "official" | "assignor" | "school";
export type BidderType = "individual" | "crew";
export type GameMode = "marketplace" | "direct_assignment";
export type RatingTargetType = "official" | "crew";
export type FootballPosition =
  | "R"
  | "U"
  | "C"
  | "H"
  | "L"
  | "S"
  | "F"
  | "B"
  | "RO"
  | "RC"
  | "ALT";

export interface UserProfile {
  uid: string;
  email: string;
  emailLowercase?: string;
  displayName: string;
  role: UserRole;
  createdAtISO: string;
}

export interface CrewMember {
  uid: string;
  name: string;
  email: string;
}

export interface Crew {
  id: string;
  name: string;
  createdByUid: string;
  createdByName: string;
  createdByRole: CrewOwnerRole;
  createdAtISO: string;
  memberUids: string[];
  members: CrewMember[];
}

export interface IndividualGameAssignment {
  assignmentType: "individual";
  officialUid: string;
  officialName: string;
  officialEmail: string;
  position?: FootballPosition;
}

export interface CrewGameAssignment {
  assignmentType: "crew";
  crewId: string;
  crewName: string;
  memberUids: string[];
  memberNames: string[];
}

export type GameAssignment = IndividualGameAssignment | CrewGameAssignment;

export interface Game {
  id: string;
  schoolName: string;
  sport: Sport;
  level: Level;
  dateISO: string;
  acceptingBidsUntilISO?: string;
  location: string;
  payPosted: number;
  notes?: string;
  createdByUid: string;
  createdByName?: string;
  createdByRole: "assignor" | "school";
  createdAtISO: string;
  status: GameStatus;
  mode?: GameMode;
  directAssignments?: GameAssignment[];
  selectedBidId?: string;
}

export interface Bid {
  id: string;
  gameId: string;
  officialUid: string;
  officialName: string;
  bidderType?: BidderType;
  crewId?: string;
  crewName?: string;
  amount: number;
  message?: string;
  createdAtISO: string;
}

export interface Rating {
  id: string;
  gameId: string;
  targetType: RatingTargetType;
  targetId: string;
  targetName: string;
  ratedByUid: string;
  ratedByName: string;
  ratedByRole: "assignor" | "school";
  stars: number;
  comment?: string;
  createdAtISO: string;
  updatedAtISO: string;
}

export type Sport = "Football" | "Basketball" | "Soccer" | "Baseball";

export type Level =
  | "NCAA"
  | "Varsity"
  | "Junior Varsity"
  | "Middle School"
  | "Youth";

export type UserRole = "official" | "assignor" | "school" | "evaluator";
export type OfficiatingLevel =
  | "Varsity"
  | "Sub Varsity"
  | "NCAA DI"
  | "NCAA DII"
  | "NCAA DIII";

export type GameStatus = "open" | "awarded";
export type CrewOwnerRole = "official" | "assignor" | "school";
export type BidderType = "individual" | "crew";
export type GameMode = "marketplace" | "direct_assignment";
export type RatingTargetType = "official" | "crew" | "school" | "venue";
export type CrewRosterSource = "baseCrew" | "alternate";
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

export interface GeoPoint {
  lat: number;
  lng: number;
}

export interface OfficialAvailability {
  blockedDateKeys: string[];
}

export interface UserProfile {
  uid: string;
  email: string;
  emailLowercase?: string;
  displayName: string;
  role: UserRole;
  createdAtISO: string;
  levelsOfficiated?: OfficiatingLevel[];
  contactInfo?: {
    addressLine1?: string;
    addressLine2?: string;
      city?: string;
      state?: string;
      postalCode?: string;
  };
  locationCoordinates?: GeoPoint;
  availability?: OfficialAvailability;
}

export interface CrewMember {
  uid: string;
  name: string;
  email: string;
}

export interface CrewRosterOfficial {
  officialUid: string;
  officialName: string;
  officialEmail?: string;
  role?: FootballPosition;
  source: CrewRosterSource;
  baseCrewMember: boolean;
}

export interface Crew {
  id: string;
  name: string;
  createdByUid: string;
  createdByName: string;
  createdByRole: CrewOwnerRole;
  createdAtISO: string;
  crewChiefUid: string;
  crewChiefName: string;
  refereeOfficialId?: string;
  memberUids: string[];
  members: CrewMember[];
  memberPositions: Partial<Record<string, FootballPosition>>;
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
  requestedCrewSize?: number;
  dateISO: string;
  scheduledDateKey?: string;
  acceptingBidsUntilISO?: string;
  location: string;
  locationCoordinates?: GeoPoint;
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
  awardedCrewId?: string;
  assignedOfficials?: CrewRosterOfficial[];
}

export interface Bid {
  id: string;
  gameId: string;
  officialUid: string;
  createdByOfficialId?: string;
  officialName: string;
  bidderType?: BidderType;
  crewId?: string;
  baseCrewId?: string;
  crewName?: string;
  proposedRoster?: CrewRosterOfficial[];
  amount: number;
  message?: string;
  createdAtISO: string;
}

export interface SchoolExperienceRating {
  greetedOnArrival: boolean;
  satisfactoryLockerRoom: boolean;
  towelsProvided: boolean;
  foodDrinkProvided: boolean;
}

export interface Rating {
  id: string;
  gameId: string;
  targetType: RatingTargetType;
  targetId: string;
  ratedByUid: string;
  ratedByRole: "assignor" | "school" | "official" | "evaluator";
  stars: number;
  comment?: string;
  schoolExperience?: SchoolExperienceRating;
  createdAtISO: string;
  updatedAtISO: string;
}

export interface Evaluation {
  id: string;
  gameId: string;
  evaluatorUid: string;
  overallScore: number;
  notes?: string;
  createdAtISO: string;
  updatedAtISO: string;
}

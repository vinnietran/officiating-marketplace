import {
  addDoc,
  collection,
  deleteField,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  setDoc,
  updateDoc,
  where,
  type Firestore,
  type Unsubscribe
} from "firebase/firestore";
import { db, dbFallback } from "./firebase";
import { getCoordinatesForAddress } from "./googlePlaces";
import type {
  Bid,
  Crew,
  CrewMember,
  Evaluation,
  FootballPosition,
  Game,
  GameAssignment,
  GeoPoint,
  Level,
  OfficiatingLevel,
  Rating,
  RatingTargetType,
  Sport,
  UserProfile
} from "../types";

const GAMES_COLLECTION = "games";
const BIDS_COLLECTION = "bids";
const CREWS_COLLECTION = "crews";
const RATINGS_COLLECTION = "ratings";
const EVALUATIONS_COLLECTION = "evaluations";
const USER_PROFILES_COLLECTION = "userProfiles";
const OFFICIATING_LEVELS: OfficiatingLevel[] = [
  "Varsity",
  "Sub Varsity",
  "NCAA DI",
  "NCAA DII",
  "NCAA DIII"
];
const FOOTBALL_POSITIONS: FootballPosition[] = [
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

function isMissingDatabaseError(error: unknown): boolean {
  const maybeCode =
    error && typeof error === "object" && "code" in error
      ? String((error as { code?: unknown }).code ?? "")
      : "";
  const message = error instanceof Error ? error.message : String(error ?? "");
  return (
    maybeCode === "not-found" ||
    (message.includes("Database") && message.includes("not found"))
  );
}

async function runWithDbFallback<T>(
  operation: (database: Firestore) => Promise<T>
): Promise<T> {
  try {
    return await operation(db);
  } catch (error) {
    if (dbFallback && isMissingDatabaseError(error)) {
      if (import.meta.env.DEV) {
        console.warn(
          "Primary Firestore database was not found. Retrying with fallback database ID."
        );
      }
      return operation(dbFallback);
    }
    throw error;
  }
}

function buildAddressString(contactInfo: UpdateOfficialProfileInput["contactInfo"]): string {
  return [
    contactInfo.addressLine1 ?? "",
    contactInfo.addressLine2 ?? "",
    contactInfo.city ?? "",
    contactInfo.state ?? "",
    contactInfo.postalCode ?? ""
  ]
    .map((value) => value.trim())
    .filter(Boolean)
    .join(", ");
}

async function geocodeAddressSafely(address: string): Promise<GeoPoint | null> {
  const trimmedAddress = address.trim();
  if (!trimmedAddress) {
    return null;
  }

  try {
    return await getCoordinatesForAddress(trimmedAddress);
  } catch {
    return null;
  }
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((entry) => typeof entry === "string");
}

function normalizeCrewMemberPositions(
  rawPositions: Record<string, unknown> | undefined,
  memberUids: string[]
): Partial<Record<string, FootballPosition>> {
  if (!rawPositions) {
    return {};
  }

  const allowedPositions = new Set<FootballPosition>(FOOTBALL_POSITIONS);
  const memberUidSet = new Set(memberUids);
  const normalized: Partial<Record<string, FootballPosition>> = {};

  Object.entries(rawPositions).forEach(([uid, rawPosition]) => {
    if (!memberUidSet.has(uid) || typeof rawPosition !== "string") {
      return;
    }

    const position = rawPosition as FootballPosition;
    if (!allowedPositions.has(position)) {
      return;
    }

    normalized[uid] = position;
  });

  return normalized;
}

export interface NewGameInput {
  schoolName: string;
  sport: Sport;
  level: Level;
  dateISO: string;
  acceptingBidsUntilISO?: string;
  location: string;
  payPosted: number;
  notes?: string;
}

export interface NewAssignedGameInput {
  schoolName: string;
  sport: Sport;
  level: Level;
  dateISO: string;
  location: string;
  payPosted: number;
  notes?: string;
  directAssignments: GameAssignment[];
}

export interface NewBidInput {
  gameId: string;
  officialUid: string;
  officialName: string;
  bidderType: "individual" | "crew";
  crewId?: string;
  crewName?: string;
  amount: number;
  message?: string;
}

export interface UpdateBidInput {
  officialName: string;
  bidderType?: "individual" | "crew";
  crewId?: string;
  crewName?: string;
  amount: number;
  message?: string;
}

export interface NewCrewInput {
  name: string;
  members: CrewMember[];
  memberPositions?: Partial<Record<string, FootballPosition>>;
}

export interface UpsertGameRatingInput {
  gameId: string;
  targetType: RatingTargetType;
  targetId: string;
  stars: number;
  comment?: string;
}

export interface UpsertGameEvaluationInput {
  gameId: string;
  overallScore: number;
  notes?: string;
}

export interface UpdateOfficialProfileInput {
  levelsOfficiated: OfficiatingLevel[];
  contactInfo: {
    addressLine1?: string;
    addressLine2?: string;
    city?: string;
    state?: string;
    postalCode?: string;
  };
}

export async function createUserProfile(profile: UserProfile): Promise<void> {
  const normalizedProfile: UserProfile = {
    ...profile,
    emailLowercase: profile.emailLowercase ?? profile.email.toLowerCase()
  };

  await runWithDbFallback((database) =>
    setDoc(doc(database, USER_PROFILES_COLLECTION, profile.uid), normalizedProfile)
  );
}

export async function getUserProfile(uid: string): Promise<UserProfile | null> {
  const snapshot = await runWithDbFallback((database) =>
    getDoc(doc(database, USER_PROFILES_COLLECTION, uid))
  );
  if (!snapshot.exists()) {
    return null;
  }

  const profile = snapshot.data() as UserProfile;
  return {
    ...profile,
    emailLowercase: profile.emailLowercase ?? profile.email.toLowerCase()
  };
}

export async function getUserProfilesByUids(
  uids: string[]
): Promise<Record<string, UserProfile>> {
  const uniqueUids = Array.from(new Set(uids.filter(Boolean)));
  if (uniqueUids.length === 0) {
    return {};
  }

  const snapshots = await Promise.all(
    uniqueUids.map((uid) =>
      runWithDbFallback((database) =>
        getDoc(doc(database, USER_PROFILES_COLLECTION, uid))
      )
    )
  );

  return snapshots.reduce<Record<string, UserProfile>>((accumulator, snapshot) => {
    if (snapshot.exists()) {
      const data = snapshot.data() as UserProfile;
      accumulator[data.uid] = {
        ...data,
        emailLowercase: data.emailLowercase ?? data.email.toLowerCase()
      };
    }
    return accumulator;
  }, {});
}

export async function updateOfficialProfile(
  uid: string,
  input: UpdateOfficialProfileInput
): Promise<void> {
  const allowedLevels = new Set<OfficiatingLevel>(OFFICIATING_LEVELS);
  const normalizedLevels = Array.from(
    new Set(input.levelsOfficiated.filter((level) => allowedLevels.has(level)))
  );

  const normalizedContactInfo = {
    addressLine1: input.contactInfo.addressLine1?.trim() ?? "",
    addressLine2: input.contactInfo.addressLine2?.trim() ?? "",
    city: input.contactInfo.city?.trim() ?? "",
    state: input.contactInfo.state?.trim() ?? "",
    postalCode: input.contactInfo.postalCode?.trim() ?? ""
  };

  const hasContactInfo = Object.values(normalizedContactInfo).some(Boolean);
  const locationCoordinates = hasContactInfo
    ? await geocodeAddressSafely(buildAddressString(normalizedContactInfo))
    : null;

  const profileUpdatePayload: Record<string, unknown> = {
    levelsOfficiated: normalizedLevels,
    contactInfo: hasContactInfo ? normalizedContactInfo : deleteField()
  };

  if (!hasContactInfo) {
    profileUpdatePayload.locationCoordinates = deleteField();
  } else if (locationCoordinates) {
    profileUpdatePayload.locationCoordinates = locationCoordinates;
  }

  await runWithDbFallback((database) =>
    updateDoc(doc(database, USER_PROFILES_COLLECTION, uid), profileUpdatePayload)
  );
}

export async function searchOfficialProfilesByEmail(
  rawEmail: string
): Promise<UserProfile[]> {
  const email = rawEmail.trim();
  if (!email) {
    return [];
  }

  const lowercaseEmail = email.toLowerCase();

  const [byLowercaseSnapshots, byEmailSnapshots] = await Promise.all([
    runWithDbFallback((database) =>
      getDocs(
        query(
          collection(database, USER_PROFILES_COLLECTION),
          where("emailLowercase", "==", lowercaseEmail),
          limit(5)
        )
      )
    ),
    runWithDbFallback((database) =>
      getDocs(
        query(
          collection(database, USER_PROFILES_COLLECTION),
          where("email", "==", email),
          limit(5)
        )
      )
    )
  ]);

  const merged = new Map<string, UserProfile>();
  [...byLowercaseSnapshots.docs, ...byEmailSnapshots.docs].forEach((snapshot) => {
    const data = snapshot.data() as UserProfile;
    merged.set(snapshot.id, {
      ...data,
      uid: data.uid || snapshot.id,
      emailLowercase: data.emailLowercase ?? data.email.toLowerCase()
    });
  });

  return Array.from(merged.values()).filter((profile) => profile.role === "official");
}

export function subscribeGames(
  onChange: (games: Game[]) => void,
  onError?: (error: Error) => void
): Unsubscribe {
  let unsubscribeCurrent: Unsubscribe = () => undefined;
  let hasRetriedWithFallback = false;

  const subscribeToDatabase = (database: Firestore): Unsubscribe => {
    const gamesQuery = query(
      collection(database, GAMES_COLLECTION),
      orderBy("dateISO", "asc")
    );

    return onSnapshot(
      gamesQuery,
      (snapshot) => {
        const games = snapshot.docs.map(
          (gameDoc) => ({ id: gameDoc.id, ...gameDoc.data() }) as Game
        );
        onChange(games);
      },
      (error) => {
        if (
          !hasRetriedWithFallback &&
          dbFallback &&
          database === db &&
          isMissingDatabaseError(error)
        ) {
          hasRetriedWithFallback = true;
          if (import.meta.env.DEV) {
            console.warn(
              "Games subscription switched to fallback Firestore database ID."
            );
          }
          unsubscribeCurrent();
          unsubscribeCurrent = subscribeToDatabase(dbFallback);
          return;
        }

        if (onError) {
          onError(error as Error);
        }
      }
    );
  };

  unsubscribeCurrent = subscribeToDatabase(db);
  return () => unsubscribeCurrent();
}

export function subscribeBids(
  onChange: (bids: Bid[]) => void,
  onError?: (error: Error) => void
): Unsubscribe {
  let unsubscribeCurrent: Unsubscribe = () => undefined;
  let hasRetriedWithFallback = false;

  const subscribeToDatabase = (database: Firestore): Unsubscribe => {
    const bidsQuery = query(
      collection(database, BIDS_COLLECTION),
      orderBy("createdAtISO", "desc")
    );

    return onSnapshot(
      bidsQuery,
      (snapshot) => {
        const bids = snapshot.docs.map(
          (bidDoc) => ({ id: bidDoc.id, ...bidDoc.data() }) as Bid
        );
        onChange(bids);
      },
      (error) => {
        if (
          !hasRetriedWithFallback &&
          dbFallback &&
          database === db &&
          isMissingDatabaseError(error)
        ) {
          hasRetriedWithFallback = true;
          if (import.meta.env.DEV) {
            console.warn(
              "Bids subscription switched to fallback Firestore database ID."
            );
          }
          unsubscribeCurrent();
          unsubscribeCurrent = subscribeToDatabase(dbFallback);
          return;
        }

        if (onError) {
          onError(error as Error);
        }
      }
    );
  };

  unsubscribeCurrent = subscribeToDatabase(db);
  return () => unsubscribeCurrent();
}

export function subscribeOfficialProfiles(
  onChange: (profiles: UserProfile[]) => void,
  onError?: (error: Error) => void
): Unsubscribe {
  let unsubscribeCurrent: Unsubscribe = () => undefined;
  let hasRetriedWithFallback = false;

  const subscribeToDatabase = (database: Firestore): Unsubscribe => {
    const profilesCollection = collection(database, USER_PROFILES_COLLECTION);

    return onSnapshot(
      profilesCollection,
      (snapshot) => {
        const profiles = snapshot.docs
          .map((profileDoc) => {
            const data = profileDoc.data() as UserProfile;
            return {
              ...data,
              uid: data.uid || profileDoc.id,
              emailLowercase: data.emailLowercase ?? data.email.toLowerCase()
            } as UserProfile;
          })
          .filter((profile) => profile.role === "official")
          .sort((a, b) => a.displayName.localeCompare(b.displayName));

        onChange(profiles);
      },
      (error) => {
        if (
          !hasRetriedWithFallback &&
          dbFallback &&
          database === db &&
          isMissingDatabaseError(error)
        ) {
          hasRetriedWithFallback = true;
          if (import.meta.env.DEV) {
            console.warn(
              "Official profiles subscription switched to fallback Firestore database ID."
            );
          }
          unsubscribeCurrent();
          unsubscribeCurrent = subscribeToDatabase(dbFallback);
          return;
        }

        if (onError) {
          onError(error as Error);
        }
      }
    );
  };

  unsubscribeCurrent = subscribeToDatabase(db);
  return () => unsubscribeCurrent();
}

export function subscribeCrews(
  onChange: (crews: Crew[]) => void,
  onError?: (error: Error) => void
): Unsubscribe {
  let unsubscribeCurrent: Unsubscribe = () => undefined;
  let hasRetriedWithFallback = false;

  const subscribeToDatabase = (database: Firestore): Unsubscribe => {
    const crewsQuery = query(
      collection(database, CREWS_COLLECTION),
      orderBy("createdAtISO", "desc")
    );

    return onSnapshot(
      crewsQuery,
      (snapshot) => {
        const crews = snapshot.docs.map((crewDoc) => {
          const data = crewDoc.data() as Partial<Crew>;
          const fallbackChiefUid =
            typeof data.createdByUid === "string" ? data.createdByUid : "";
          const fallbackChiefName =
            typeof data.createdByName === "string" ? data.createdByName : "Crew Creator";
          const memberUids = isStringArray(data.memberUids) ? data.memberUids : [];
          const memberPositions = normalizeCrewMemberPositions(
            typeof data.memberPositions === "object" && data.memberPositions
              ? (data.memberPositions as Record<string, unknown>)
              : undefined,
            memberUids
          );
          return {
            id: crewDoc.id,
            ...data,
            memberUids,
            memberPositions,
            crewChiefUid:
              typeof data.crewChiefUid === "string" && data.crewChiefUid.trim()
                ? data.crewChiefUid
                : fallbackChiefUid,
            crewChiefName:
              typeof data.crewChiefName === "string" && data.crewChiefName.trim()
                ? data.crewChiefName
                : fallbackChiefName
          } as Crew;
        });
        onChange(crews);
      },
      (error) => {
        if (
          !hasRetriedWithFallback &&
          dbFallback &&
          database === db &&
          isMissingDatabaseError(error)
        ) {
          hasRetriedWithFallback = true;
          if (import.meta.env.DEV) {
            console.warn(
              "Crews subscription switched to fallback Firestore database ID."
            );
          }
          unsubscribeCurrent();
          unsubscribeCurrent = subscribeToDatabase(dbFallback);
          return;
        }

        if (onError) {
          onError(error as Error);
        }
      }
    );
  };

  unsubscribeCurrent = subscribeToDatabase(db);
  return () => unsubscribeCurrent();
}

export function subscribeRatingsForGame(
  gameId: string,
  onChange: (ratings: Rating[]) => void,
  onError?: (error: Error) => void
): Unsubscribe {
  let unsubscribeCurrent: Unsubscribe = () => undefined;
  let hasRetriedWithFallback = false;

  const subscribeToDatabase = (database: Firestore): Unsubscribe => {
    const ratingsQuery = query(
      collection(database, RATINGS_COLLECTION),
      where("gameId", "==", gameId)
    );

    return onSnapshot(
      ratingsQuery,
      (snapshot) => {
        const ratings = snapshot.docs.map((ratingDoc) => {
          const data = ratingDoc.data();
          return {
            id: ratingDoc.id,
            ...data
          } as Rating;
        });
        onChange(ratings);
      },
      (error) => {
        if (
          !hasRetriedWithFallback &&
          dbFallback &&
          database === db &&
          isMissingDatabaseError(error)
        ) {
          hasRetriedWithFallback = true;
          if (import.meta.env.DEV) {
            console.warn(
              "Ratings subscription switched to fallback Firestore database ID."
            );
          }
          unsubscribeCurrent();
          unsubscribeCurrent = subscribeToDatabase(dbFallback);
          return;
        }

        if (onError) {
          onError(error as Error);
        }
      }
    );
  };

  unsubscribeCurrent = subscribeToDatabase(db);
  return () => unsubscribeCurrent();
}

export function subscribeEvaluationsForGame(
  gameId: string,
  onChange: (evaluations: Evaluation[]) => void,
  onError?: (error: Error) => void
): Unsubscribe {
  let unsubscribeCurrent: Unsubscribe = () => undefined;
  let hasRetriedWithFallback = false;

  const subscribeToDatabase = (database: Firestore): Unsubscribe => {
    const evaluationsQuery = query(
      collection(database, EVALUATIONS_COLLECTION),
      where("gameId", "==", gameId)
    );

    return onSnapshot(
      evaluationsQuery,
      (snapshot) => {
        const evaluations = snapshot.docs.map((evaluationDoc) => {
          const data = evaluationDoc.data();
          return {
            id: evaluationDoc.id,
            ...data
          } as Evaluation;
        });
        onChange(evaluations);
      },
      (error) => {
        if (
          !hasRetriedWithFallback &&
          dbFallback &&
          database === db &&
          isMissingDatabaseError(error)
        ) {
          hasRetriedWithFallback = true;
          if (import.meta.env.DEV) {
            console.warn(
              "Evaluations subscription switched to fallback Firestore database ID."
            );
          }
          unsubscribeCurrent();
          unsubscribeCurrent = subscribeToDatabase(dbFallback);
          return;
        }

        if (onError) {
          onError(error as Error);
        }
      }
    );
  };

  unsubscribeCurrent = subscribeToDatabase(db);
  return () => unsubscribeCurrent();
}

export function subscribeRatings(
  onChange: (ratings: Rating[]) => void,
  onError?: (error: Error) => void
): Unsubscribe {
  let unsubscribeCurrent: Unsubscribe = () => undefined;
  let hasRetriedWithFallback = false;

  const subscribeToDatabase = (database: Firestore): Unsubscribe => {
    const ratingsQuery = query(
      collection(database, RATINGS_COLLECTION),
      orderBy("updatedAtISO", "desc")
    );

    return onSnapshot(
      ratingsQuery,
      (snapshot) => {
        const ratings = snapshot.docs.map((ratingDoc) => {
          const data = ratingDoc.data();
          return {
            id: ratingDoc.id,
            ...data
          } as Rating;
        });
        onChange(ratings);
      },
      (error) => {
        if (
          !hasRetriedWithFallback &&
          dbFallback &&
          database === db &&
          isMissingDatabaseError(error)
        ) {
          hasRetriedWithFallback = true;
          if (import.meta.env.DEV) {
            console.warn(
              "Ratings subscription switched to fallback Firestore database ID."
            );
          }
          unsubscribeCurrent();
          unsubscribeCurrent = subscribeToDatabase(dbFallback);
          return;
        }

        if (onError) {
          onError(error as Error);
        }
      }
    );
  };

  unsubscribeCurrent = subscribeToDatabase(db);
  return () => unsubscribeCurrent();
}

export async function createGame(
  input: NewGameInput,
  createdBy: { uid: string; role: "assignor" | "school"; displayName: string }
): Promise<void> {
  const locationCoordinates = await geocodeAddressSafely(input.location);

  const gamePayload = {
    schoolName: input.schoolName,
    sport: input.sport,
    level: input.level,
    dateISO: input.dateISO,
    location: input.location,
    ...(locationCoordinates ? { locationCoordinates } : {}),
    payPosted: input.payPosted,
    createdByUid: createdBy.uid,
    createdByName: createdBy.displayName,
    createdByRole: createdBy.role,
    createdAtISO: new Date().toISOString(),
    status: "open",
    mode: "marketplace",
    ...(input.acceptingBidsUntilISO
      ? { acceptingBidsUntilISO: input.acceptingBidsUntilISO }
      : {}),
    ...(input.notes ? { notes: input.notes } : {})
  };

  await runWithDbFallback((database) =>
    addDoc(collection(database, GAMES_COLLECTION), gamePayload)
  );
}

export async function createAssignedGame(
  input: NewAssignedGameInput,
  createdBy: { uid: string; role: "assignor" | "school"; displayName: string }
): Promise<void> {
  const locationCoordinates = await geocodeAddressSafely(input.location);

  const gamePayload = {
    schoolName: input.schoolName,
    sport: input.sport,
    level: input.level,
    dateISO: input.dateISO,
    location: input.location,
    ...(locationCoordinates ? { locationCoordinates } : {}),
    payPosted: input.payPosted,
    createdByUid: createdBy.uid,
    createdByName: createdBy.displayName,
    createdByRole: createdBy.role,
    createdAtISO: new Date().toISOString(),
    status: "awarded",
    mode: "direct_assignment",
    directAssignments: input.directAssignments,
    ...(input.notes ? { notes: input.notes } : {})
  };

  await runWithDbFallback((database) =>
    addDoc(collection(database, GAMES_COLLECTION), gamePayload)
  );
}

export async function updateGame(gameId: string, input: NewGameInput): Promise<void> {
  const locationCoordinates = await geocodeAddressSafely(input.location);

  const gamePayload: Record<string, unknown> = {
    schoolName: input.schoolName,
    sport: input.sport,
    level: input.level,
    dateISO: input.dateISO,
    location: input.location,
    payPosted: input.payPosted,
    acceptingBidsUntilISO: input.acceptingBidsUntilISO
      ? input.acceptingBidsUntilISO
      : deleteField(),
    notes: input.notes ? input.notes : deleteField()
  };

  if (locationCoordinates) {
    gamePayload.locationCoordinates = locationCoordinates;
  }

  await runWithDbFallback((database) =>
    updateDoc(doc(database, GAMES_COLLECTION, gameId), gamePayload)
  );
}

export async function createBid(input: NewBidInput): Promise<void> {
  const bidPayload = {
    gameId: input.gameId,
    officialUid: input.officialUid,
    officialName: input.officialName,
    bidderType: input.bidderType,
    amount: input.amount,
    createdAtISO: new Date().toISOString(),
    ...(input.bidderType === "crew" && input.crewId
      ? { crewId: input.crewId, crewName: input.crewName ?? "Crew" }
      : {}),
    ...(input.message ? { message: input.message } : {})
  };

  await runWithDbFallback((database) =>
    addDoc(collection(database, BIDS_COLLECTION), bidPayload)
  );
}

export async function updateBid(bidId: string, input: UpdateBidInput): Promise<void> {
  const bidPayload = {
    officialName: input.officialName,
    amount: input.amount,
    createdAtISO: new Date().toISOString(),
    bidderType: input.bidderType ?? "individual",
    crewId: input.bidderType === "crew" && input.crewId ? input.crewId : deleteField(),
    crewName:
      input.bidderType === "crew" && input.crewName ? input.crewName : deleteField(),
    message: input.message ? input.message : deleteField()
  };

  await runWithDbFallback((database) =>
    updateDoc(doc(database, BIDS_COLLECTION, bidId), bidPayload)
  );
}

export async function deleteBid(bidId: string): Promise<void> {
  await runWithDbFallback((database) =>
    deleteDoc(doc(database, BIDS_COLLECTION, bidId))
  );
}

export async function createCrew(
  input: NewCrewInput,
  createdBy: {
    uid: string;
    role: "official" | "assignor" | "school";
    displayName: string;
  }
): Promise<void> {
  const normalizedName = input.name.trim();
  const uniqueMembers = Array.from(
    new Map(input.members.map((member) => [member.uid, member])).values()
  );
  const memberUids = uniqueMembers.map((member) => member.uid);
  const memberPositions = normalizeCrewMemberPositions(
    input.memberPositions as Record<string, unknown> | undefined,
    memberUids
  );

  if (!normalizedName) {
    throw new Error("Crew name is required.");
  }

  if (uniqueMembers.length < 1 || uniqueMembers.length > 15) {
    throw new Error("Crew must include between 1 and 15 members.");
  }

  const crewPayload = {
    name: normalizedName,
    createdByUid: createdBy.uid,
    createdByName: createdBy.displayName,
    createdByRole: createdBy.role,
    createdAtISO: new Date().toISOString(),
    crewChiefUid: createdBy.uid,
    crewChiefName: createdBy.displayName,
    memberUids,
    members: uniqueMembers.map((member) => ({
      uid: member.uid,
      name: member.name,
      email: member.email
    })),
    memberPositions
  };

  await runWithDbFallback((database) =>
    addDoc(collection(database, CREWS_COLLECTION), crewPayload)
  );
}

export async function deleteCrew(crewId: string): Promise<void> {
  await runWithDbFallback((database) =>
    deleteDoc(doc(database, CREWS_COLLECTION, crewId))
  );
}

export async function updateCrewMembers(
  crewId: string,
  members: CrewMember[]
): Promise<void> {
  const uniqueMembers = Array.from(
    new Map(members.map((member) => [member.uid, member])).values()
  );

  if (uniqueMembers.length < 1 || uniqueMembers.length > 15) {
    throw new Error("Crew must include between 1 and 15 members.");
  }

  await runWithDbFallback(async (database) => {
    const crewRef = doc(database, CREWS_COLLECTION, crewId);
    const crewSnapshot = await getDoc(crewRef);
    if (!crewSnapshot.exists()) {
      throw new Error("Crew not found.");
    }

    const existingCrew = crewSnapshot.data() as Partial<Crew>;
    const memberUids = uniqueMembers.map((member) => member.uid);
    const memberPositions = normalizeCrewMemberPositions(
      typeof existingCrew.memberPositions === "object" && existingCrew.memberPositions
        ? (existingCrew.memberPositions as Record<string, unknown>)
        : undefined,
      memberUids
    );

    await updateDoc(crewRef, {
      memberUids,
      members: uniqueMembers.map((member) => ({
        uid: member.uid,
        name: member.name,
        email: member.email
      })),
      memberPositions
    });
  });
}

export async function updateCrewChief(
  crewId: string,
  chief: Pick<CrewMember, "uid" | "name">
): Promise<void> {
  if (!chief.uid.trim()) {
    throw new Error("Crew chief is required.");
  }

  await runWithDbFallback((database) =>
    updateDoc(doc(database, CREWS_COLLECTION, crewId), {
      crewChiefUid: chief.uid.trim(),
      crewChiefName: chief.name.trim() || "Crew Chief"
    })
  );
}

export async function updateCrewMemberPositions(
  crewId: string,
  memberPositions: Partial<Record<string, FootballPosition>>
): Promise<void> {
  await runWithDbFallback(async (database) => {
    const crewRef = doc(database, CREWS_COLLECTION, crewId);
    const crewSnapshot = await getDoc(crewRef);
    if (!crewSnapshot.exists()) {
      throw new Error("Crew not found.");
    }

    const crew = crewSnapshot.data() as Partial<Crew>;
    const memberUids = isStringArray(crew.memberUids) ? crew.memberUids : [];
    const normalizedMemberPositions = normalizeCrewMemberPositions(
      memberPositions as Record<string, unknown>,
      memberUids
    );

    await updateDoc(crewRef, {
      memberPositions: normalizedMemberPositions
    });
  });
}

export async function upsertGameRating(
  input: UpsertGameRatingInput,
  ratedBy: { uid: string; role: "assignor" | "school" | "official" }
): Promise<void> {
  if (!Number.isInteger(input.stars) || input.stars < 1 || input.stars > 5) {
    throw new Error("Rating must be an integer between 1 and 5.");
  }

  const nowISO = new Date().toISOString();
  const ratingId = `${input.gameId}__${ratedBy.uid}__${input.targetType}__${input.targetId}`;
  const payload = {
    gameId: input.gameId,
    targetType: input.targetType,
    targetId: input.targetId,
    ratedByUid: ratedBy.uid,
    ratedByRole: ratedBy.role,
    stars: input.stars,
    updatedAtISO: nowISO,
    createdAtISO: nowISO,
    targetName: deleteField(),
    ratedByName: deleteField(),
    comment: input.comment ? input.comment : deleteField()
  };

  await runWithDbFallback((database) =>
    setDoc(doc(database, RATINGS_COLLECTION, ratingId), payload, { merge: true })
  );
}

export async function upsertGameEvaluation(
  input: UpsertGameEvaluationInput,
  evaluator: { uid: string }
): Promise<void> {
  if (!Number.isInteger(input.overallScore) || input.overallScore < 1 || input.overallScore > 5) {
    throw new Error("Overall score must be an integer between 1 and 5.");
  }

  const nowISO = new Date().toISOString();
  const evaluationId = `${input.gameId}__${evaluator.uid}`;
  const payload = {
    gameId: input.gameId,
    evaluatorUid: evaluator.uid,
    overallScore: input.overallScore,
    updatedAtISO: nowISO,
    createdAtISO: nowISO,
    notes: input.notes ? input.notes : deleteField()
  };

  await runWithDbFallback((database) =>
    setDoc(doc(database, EVALUATIONS_COLLECTION, evaluationId), payload, { merge: true })
  );
}

export async function selectBid(gameId: string, bidId: string): Promise<void> {
  await runWithDbFallback((database) =>
    updateDoc(doc(database, GAMES_COLLECTION, gameId), {
      selectedBidId: bidId,
      status: "awarded"
    })
  );
}

export async function deleteGame(gameId: string): Promise<void> {
  await runWithDbFallback(async (database) => {
    const bidsSnapshot = await getDocs(
      query(collection(database, BIDS_COLLECTION), where("gameId", "==", gameId))
    );

    if (!bidsSnapshot.empty) {
      await Promise.all(
        bidsSnapshot.docs.map((bidDoc) =>
          deleteDoc(doc(database, BIDS_COLLECTION, bidDoc.id))
        )
      );
    }

    await deleteDoc(doc(database, GAMES_COLLECTION, gameId));
  });
}

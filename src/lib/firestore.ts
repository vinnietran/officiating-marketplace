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
import type { Bid, Crew, CrewMember, Game, Level, Sport, UserProfile } from "../types";

const GAMES_COLLECTION = "games";
const BIDS_COLLECTION = "bids";
const CREWS_COLLECTION = "crews";
const USER_PROFILES_COLLECTION = "userProfiles";

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
          const data = crewDoc.data();
          return {
            id: crewDoc.id,
            ...data
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

export async function createGame(
  input: NewGameInput,
  createdBy: { uid: string; role: "assignor" | "school"; displayName: string }
): Promise<void> {
  const gamePayload = {
    schoolName: input.schoolName,
    sport: input.sport,
    level: input.level,
    dateISO: input.dateISO,
    location: input.location,
    payPosted: input.payPosted,
    createdByUid: createdBy.uid,
    createdByName: createdBy.displayName,
    createdByRole: createdBy.role,
    createdAtISO: new Date().toISOString(),
    status: "open",
    ...(input.acceptingBidsUntilISO
      ? { acceptingBidsUntilISO: input.acceptingBidsUntilISO }
      : {}),
    ...(input.notes ? { notes: input.notes } : {})
  };

  await runWithDbFallback((database) =>
    addDoc(collection(database, GAMES_COLLECTION), gamePayload)
  );
}

export async function updateGame(gameId: string, input: NewGameInput): Promise<void> {
  const gamePayload = {
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
  createdBy: { uid: string; role: "official" | "assignor"; displayName: string }
): Promise<void> {
  const normalizedName = input.name.trim();
  const uniqueMembers = Array.from(
    new Map(input.members.map((member) => [member.uid, member])).values()
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
    memberUids: uniqueMembers.map((member) => member.uid),
    members: uniqueMembers.map((member) => ({
      uid: member.uid,
      name: member.name,
      email: member.email
    }))
  };

  await runWithDbFallback((database) =>
    addDoc(collection(database, CREWS_COLLECTION), crewPayload)
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

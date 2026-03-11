import { httpsCallable } from "firebase/functions";

import { functions } from "./firebase";
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

const POLL_INTERVAL_MS = 15000;

export type Unsubscribe = () => void;

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

function normalizeError(error: unknown): Error {
  if (error instanceof Error) {
    return error;
  }

  if (error && typeof error === "object" && "message" in error) {
    return new Error(String((error as { message?: unknown }).message ?? "Unknown error"));
  }

  return new Error(String(error ?? "Unknown error"));
}

async function callFunction<TResponse>(
  name: string,
  payload?: Record<string, unknown>
): Promise<TResponse> {
  const callable = httpsCallable<Record<string, unknown>, TResponse>(functions, name);
  const response = await callable(payload ?? {});
  return response.data;
}

function createPollingSubscription<T>(
  fetcher: () => Promise<T>,
  onChange: (value: T) => void,
  onError?: (error: Error) => void
): Unsubscribe {
  let active = true;
  let requestInFlight = false;

  const run = async () => {
    if (!active || requestInFlight) {
      return;
    }

    requestInFlight = true;
    try {
      const value = await fetcher();
      if (active) {
        onChange(value);
      }
    } catch (error) {
      if (active && onError) {
        onError(normalizeError(error));
      }
    } finally {
      requestInFlight = false;
    }
  };

  void run();

  const intervalId = window.setInterval(() => {
    void run();
  }, POLL_INTERVAL_MS);

  return () => {
    active = false;
    window.clearInterval(intervalId);
  };
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

export async function createUserProfile(profile: UserProfile): Promise<void> {
  await callFunction("createUserProfile", { profile });
}

export async function getUserProfile(uid: string): Promise<UserProfile | null> {
  return callFunction<UserProfile | null>("getUserProfile", { uid });
}

export async function getUserProfilesByUids(
  uids: string[]
): Promise<Record<string, UserProfile>> {
  return callFunction<Record<string, UserProfile>>("getUserProfilesByUids", { uids });
}

export async function updateOfficialProfile(
  uid: string,
  input: UpdateOfficialProfileInput
): Promise<void> {
  const locationCoordinates = await geocodeAddressSafely(buildAddressString(input.contactInfo));
  await callFunction("updateOfficialProfile", {
    uid,
    input: {
      ...input,
      locationCoordinates
    }
  });
}

export async function searchOfficialProfilesByEmail(
  rawEmail: string
): Promise<UserProfile[]> {
  return callFunction<UserProfile[]>("searchOfficialProfilesByEmail", { email: rawEmail });
}

export function subscribeGames(
  onChange: (games: Game[]) => void,
  onError?: (error: Error) => void
): Unsubscribe {
  return createPollingSubscription(() => callFunction<Game[]>("listGames"), onChange, onError);
}

export function subscribeBids(
  onChange: (bids: Bid[]) => void,
  onError?: (error: Error) => void
): Unsubscribe {
  return createPollingSubscription(() => callFunction<Bid[]>("listBids"), onChange, onError);
}

export function subscribeOfficialProfiles(
  onChange: (profiles: UserProfile[]) => void,
  onError?: (error: Error) => void
): Unsubscribe {
  return createPollingSubscription(
    () => callFunction<UserProfile[]>("listOfficialProfiles"),
    onChange,
    onError
  );
}

export function subscribeCrews(
  onChange: (crews: Crew[]) => void,
  onError?: (error: Error) => void
): Unsubscribe {
  return createPollingSubscription(() => callFunction<Crew[]>("listCrews"), onChange, onError);
}

export function subscribeRatingsForGame(
  gameId: string,
  onChange: (ratings: Rating[]) => void,
  onError?: (error: Error) => void
): Unsubscribe {
  return createPollingSubscription(
    () => callFunction<Rating[]>("listRatingsForGame", { gameId }),
    onChange,
    onError
  );
}

export function subscribeEvaluationsForGame(
  gameId: string,
  onChange: (evaluations: Evaluation[]) => void,
  onError?: (error: Error) => void
): Unsubscribe {
  return createPollingSubscription(
    () => callFunction<Evaluation[]>("listEvaluationsForGame", { gameId }),
    onChange,
    onError
  );
}

export function subscribeRatings(
  onChange: (ratings: Rating[]) => void,
  onError?: (error: Error) => void
): Unsubscribe {
  return createPollingSubscription(
    () => callFunction<Rating[]>("listRatings"),
    onChange,
    onError
  );
}

export async function createGame(
  input: NewGameInput,
  createdBy: { uid: string; role: "assignor" | "school"; displayName: string }
): Promise<void> {
  const locationCoordinates = await geocodeAddressSafely(input.location);
  await callFunction("createGame", {
    input: {
      ...input,
      locationCoordinates
    },
    createdBy
  });
}

export async function createAssignedGame(
  input: NewAssignedGameInput,
  createdBy: { uid: string; role: "assignor" | "school"; displayName: string }
): Promise<void> {
  const locationCoordinates = await geocodeAddressSafely(input.location);
  await callFunction("createAssignedGame", {
    input: {
      ...input,
      locationCoordinates
    },
    createdBy
  });
}

export async function updateGame(gameId: string, input: NewGameInput): Promise<void> {
  const locationCoordinates = await geocodeAddressSafely(input.location);
  await callFunction("updateGame", {
    gameId,
    input: {
      ...input,
      locationCoordinates
    }
  });
}

export async function createBid(input: NewBidInput): Promise<void> {
  await callFunction("createBid", { input });
}

export async function updateBid(bidId: string, input: UpdateBidInput): Promise<void> {
  await callFunction("updateBid", { bidId, input });
}

export async function deleteBid(bidId: string): Promise<void> {
  await callFunction("deleteBid", { bidId });
}

export async function createCrew(
  input: NewCrewInput,
  createdBy: {
    uid: string;
    role: "official" | "assignor" | "school";
    displayName: string;
  }
): Promise<void> {
  await callFunction("createCrew", { input, createdBy });
}

export async function deleteCrew(crewId: string): Promise<void> {
  await callFunction("deleteCrew", { crewId });
}

export async function updateCrewMembers(
  crewId: string,
  members: CrewMember[]
): Promise<void> {
  await callFunction("updateCrewMembers", { crewId, members });
}

export async function updateCrewChief(
  crewId: string,
  chief: Pick<CrewMember, "uid" | "name">
): Promise<void> {
  await callFunction("updateCrewChief", { crewId, chief });
}

export async function updateCrewMemberPositions(
  crewId: string,
  memberPositions: Partial<Record<string, FootballPosition>>
): Promise<void> {
  await callFunction("updateCrewMemberPositions", { crewId, memberPositions });
}

export async function upsertGameRating(
  input: UpsertGameRatingInput,
  ratedBy: { uid: string; role: "assignor" | "school" | "official" }
): Promise<void> {
  await callFunction("upsertGameRating", { input, ratedBy });
}

export async function upsertGameEvaluation(
  input: UpsertGameEvaluationInput,
  evaluator: { uid: string }
): Promise<void> {
  await callFunction("upsertGameEvaluation", { input, evaluator });
}

export async function selectBid(gameId: string, bidId: string): Promise<void> {
  await callFunction("selectBid", { gameId, bidId });
}

export async function deleteGame(gameId: string): Promise<void> {
  await callFunction("deleteGame", { gameId });
}

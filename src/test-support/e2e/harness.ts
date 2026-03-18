import type { User } from "firebase/auth";
import type {
  Bid,
  Crew,
  CrewMember,
  CrewRosterOfficial,
  Evaluation,
  FootballPosition,
  Game,
  GameAssignment,
  GeoPoint,
  Rating,
  RatingTargetType,
  UserProfile,
  UserRole
} from "../../types";

type ScenarioName = "blank" | "incomplete-profile";

interface StoredAuthUser {
  uid: string;
  email: string;
  password: string;
  displayName: string;
}

interface StoredState {
  authUsers: StoredAuthUser[];
  currentUserId: string | null;
  profiles: UserProfile[];
  games: Game[];
  bids: Bid[];
  crews: Crew[];
  ratings: Rating[];
  evaluations: Evaluation[];
  counters: Record<string, number>;
}

interface E2EController {
  getState: () => StoredState;
  resetScenario: (scenario?: ScenarioName) => void;
  replaceState: (nextState: StoredState) => void;
}

declare global {
  interface Window {
    __OFFICIATING_E2E__?: E2EController;
  }
}

const STORAGE_KEY = "officiating-marketplace:e2e-state:v1";
const DEFAULT_PASSWORD = "Password123!";
const HOME_LAT = 40.4406;
const HOME_LNG = -79.9959;

type StateChannel =
  | "auth"
  | "profiles"
  | "games"
  | "bids"
  | "crews"
  | "ratings"
  | "evaluations";

const listeners: Record<StateChannel, Set<() => void>> = {
  auth: new Set(),
  profiles: new Set(),
  games: new Set(),
  bids: new Set(),
  crews: new Set(),
  ratings: new Set(),
  evaluations: new Set()
};

let initialized = false;
let state: StoredState;

function cloneValue<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function nowIso(): string {
  return new Date().toISOString();
}

function sortProfiles(profiles: UserProfile[]): UserProfile[] {
  return [...profiles].sort((left, right) => left.displayName.localeCompare(right.displayName));
}

function sortCrews(crews: Crew[]): Crew[] {
  return [...crews].sort((left, right) => left.name.localeCompare(right.name));
}

function sortGames(games: Game[]): Game[] {
  return [...games].sort((left, right) => left.dateISO.localeCompare(right.dateISO));
}

function sortBids(bids: Bid[]): Bid[] {
  return [...bids].sort(
    (left, right) =>
      right.amount - left.amount || right.createdAtISO.localeCompare(left.createdAtISO)
  );
}

function createAuthUser(uid: string, email: string, displayName: string): StoredAuthUser {
  return {
    uid,
    email,
    password: DEFAULT_PASSWORD,
    displayName
  };
}

function createProfile(
  uid: string,
  email: string,
  displayName: string,
  role: UserRole
): UserProfile {
  return {
    uid,
    email,
    emailLowercase: email.toLowerCase(),
    displayName,
    role,
    createdAtISO: nowIso()
  };
}

function createBaseUsers(): { authUsers: StoredAuthUser[]; profiles: UserProfile[] } {
  const authUsers = [
    createAuthUser("official-1", "official1@example.com", "Olivia Official"),
    createAuthUser("official-2", "official2@example.com", "Noah Official"),
    createAuthUser("official-3", "official3@example.com", "Ava Official"),
    createAuthUser("assignor-1", "assignor@example.com", "Alex Assignor"),
    createAuthUser("school-1", "school@example.com", "Sam School"),
    createAuthUser("evaluator-1", "evaluator@example.com", "Elliot Evaluator"),
    createAuthUser("pending-1", "pending@example.com", "Pat Pending")
  ];

  const profiles = [
    createProfile("official-1", "official1@example.com", "Olivia Official", "official"),
    createProfile("official-2", "official2@example.com", "Noah Official", "official"),
    createProfile("official-3", "official3@example.com", "Ava Official", "official"),
    createProfile("assignor-1", "assignor@example.com", "Alex Assignor", "assignor"),
    createProfile("school-1", "school@example.com", "Sam School", "school"),
    createProfile("evaluator-1", "evaluator@example.com", "Elliot Evaluator", "evaluator")
  ];

  return { authUsers, profiles };
}

function createScenarioState(scenario: ScenarioName): StoredState {
  const { authUsers, profiles } = createBaseUsers();
  const baseState: StoredState = {
    authUsers,
    currentUserId: null,
    profiles,
    games: [],
    bids: [],
    crews: [],
    ratings: [],
    evaluations: [],
    counters: {
      game: 0,
      bid: 0,
      crew: 0,
      rating: 0,
      evaluation: 0,
      user: 0
    }
  };

  if (scenario === "incomplete-profile") {
    baseState.currentUserId = "pending-1";
  }

  return baseState;
}

function persistState(): void {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function notifyChannels(...channels: StateChannel[]): void {
  const uniqueChannels = new Set(channels);
  uniqueChannels.forEach((channel) => {
    listeners[channel].forEach((listener) => listener());
  });
}

function loadStateFromStorage(): StoredState | null {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return null;
    }

    const parsed = JSON.parse(raw) as StoredState;
    if (!parsed || typeof parsed !== "object") {
      return null;
    }

    return parsed;
  } catch {
    return null;
  }
}

function ensureInitialized(): void {
  if (initialized) {
    return;
  }

  const scenarioFromUrl = new URL(window.location.href).searchParams.get("e2eScenario");
  if (scenarioFromUrl === "blank" || scenarioFromUrl === "incomplete-profile") {
    state = createScenarioState(scenarioFromUrl);
    persistState();
  } else {
    state = loadStateFromStorage() ?? createScenarioState("blank");
    persistState();
  }

  window.__OFFICIATING_E2E__ = {
    getState: () => cloneValue(state),
    resetScenario: (scenario: ScenarioName = "blank") => {
      state = createScenarioState(scenario);
      persistState();
      notifyChannels(
        "auth",
        "profiles",
        "games",
        "bids",
        "crews",
        "ratings",
        "evaluations"
      );
    },
    replaceState: (nextState: StoredState) => {
      state = cloneValue(nextState);
      persistState();
      notifyChannels(
        "auth",
        "profiles",
        "games",
        "bids",
        "crews",
        "ratings",
        "evaluations"
      );
    }
  };

  initialized = true;
}

function nextId(prefix: keyof StoredState["counters"]): string {
  state.counters[prefix] = (state.counters[prefix] ?? 0) + 1;
  return `${prefix}-${state.counters[prefix]}`;
}

function getCurrentAuthUserRecord(): StoredAuthUser | null {
  if (!state.currentUserId) {
    return null;
  }

  return state.authUsers.find((user) => user.uid === state.currentUserId) ?? null;
}

function toAuthUser(user: StoredAuthUser | null): User | null {
  if (!user) {
    return null;
  }

  return {
    uid: user.uid,
    email: user.email,
    displayName: user.displayName
  } as User;
}

function subscribe(channel: StateChannel, callback: () => void): () => void {
  listeners[channel].add(callback);
  return () => {
    listeners[channel].delete(callback);
  };
}

function getProfileByUid(uid: string): UserProfile | null {
  return state.profiles.find((profile) => profile.uid === uid) ?? null;
}

function updateAuthUserDisplayName(uid: string, displayName: string): void {
  const user = state.authUsers.find((candidate) => candidate.uid === uid);
  if (!user) {
    return;
  }

  user.displayName = displayName;
}

function hashString(value: string): number {
  let result = 0;
  for (let index = 0; index < value.length; index += 1) {
    result = (result * 31 + value.charCodeAt(index)) % 100000;
  }
  return result;
}

function createPointFromAddress(address: string): GeoPoint | null {
  const normalized = address.trim().toLowerCase();
  if (!normalized) {
    return null;
  }

  const hash = hashString(normalized);
  return {
    lat: HOME_LAT + ((hash % 200) - 100) / 500,
    lng: HOME_LNG + ((Math.floor(hash / 200) % 200) - 100) / 500
  };
}

function toRadians(degrees: number): number {
  return (degrees * Math.PI) / 180;
}

function computeDistanceMiles(origin: GeoPoint, destination: GeoPoint): number {
  const earthRadiusMiles = 3958.8;
  const deltaLat = toRadians(destination.lat - origin.lat);
  const deltaLng = toRadians(destination.lng - origin.lng);
  const originLat = toRadians(origin.lat);
  const destinationLat = toRadians(destination.lat);

  const a =
    Math.sin(deltaLat / 2) ** 2 +
    Math.cos(originLat) * Math.cos(destinationLat) * Math.sin(deltaLng / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return earthRadiusMiles * c;
}

function buildAssignedOfficialsForDirectAssignments(
  directAssignments: GameAssignment[],
  crews: Crew[]
): CrewRosterOfficial[] {
  const assignedOfficials: CrewRosterOfficial[] = [];

  directAssignments.forEach((assignment) => {
    if (assignment.assignmentType === "individual") {
      assignedOfficials.push({
        officialUid: assignment.officialUid,
        officialName: assignment.officialName,
        officialEmail: assignment.officialEmail,
        role: assignment.position,
        source: "alternate",
        baseCrewMember: false
      });
      return;
    }

    const crew = crews.find((candidate) => candidate.id === assignment.crewId);
    assignment.memberUids.forEach((memberUid, index) => {
      const member = crew?.members.find((candidate) => candidate.uid === memberUid);
      assignedOfficials.push({
        officialUid: memberUid,
        officialName: assignment.memberNames[index] ?? member?.name ?? "Official",
        officialEmail: member?.email,
        role: crew?.memberPositions[memberUid],
        source: "baseCrew",
        baseCrewMember: true
      });
    });
  });

  return assignedOfficials;
}

function buildAssignedOfficialsForBid(bid: Bid, crews: Crew[]): CrewRosterOfficial[] {
  if (bid.bidderType === "crew") {
    if (bid.proposedRoster && bid.proposedRoster.length > 0) {
      return cloneValue(bid.proposedRoster);
    }

    const crewId = bid.baseCrewId ?? bid.crewId;
    const crew = crews.find((candidate) => candidate.id === crewId);
    if (crew) {
      return crew.members.map((member) => ({
        officialUid: member.uid,
        officialName: member.name,
        officialEmail: member.email,
        role: crew.memberPositions[member.uid],
        source: "baseCrew",
        baseCrewMember: true
      }));
    }
  }

  return [
    {
      officialUid: bid.officialUid,
      officialName: bid.officialName,
      source: "alternate",
      baseCrewMember: false
    }
  ];
}

function getCrewMember(uid: string): CrewMember {
  const profile = getProfileByUid(uid);
  if (profile) {
    return {
      uid: profile.uid,
      name: profile.displayName,
      email: profile.email
    };
  }

  const authUser = state.authUsers.find((candidate) => candidate.uid === uid);
  return {
    uid,
    name: authUser?.displayName ?? uid,
    email: authUser?.email ?? `${uid}@example.com`
  };
}

function deriveRefereeOfficialId(
  memberPositions: Partial<Record<string, FootballPosition>>
): string | undefined {
  const refereeEntries = Object.entries(memberPositions).filter(([, position]) => position === "R");
  if (refereeEntries.length !== 1) {
    return undefined;
  }
  return refereeEntries[0]?.[0];
}

export function initializeE2EHarness(): void {
  if (typeof window === "undefined") {
    return;
  }

  ensureInitialized();
}

export const e2eAuth = {
  onAuthStateChanged(callback: (user: User | null) => void): () => void {
    ensureInitialized();
    callback(toAuthUser(getCurrentAuthUserRecord()));
    return subscribe("auth", () => {
      callback(toAuthUser(getCurrentAuthUserRecord()));
    });
  },

  async signIn(email: string, password: string): Promise<void> {
    ensureInitialized();
    const user = state.authUsers.find(
      (candidate) =>
        candidate.email.toLowerCase() === email.trim().toLowerCase() && candidate.password === password
    );

    if (!user) {
      throw new Error("Firebase: Error (auth/invalid-credential).");
    }

    state.currentUserId = user.uid;
    persistState();
    notifyChannels("auth");
  },

  async signUp(input: {
    email: string;
    password: string;
    displayName: string;
  }): Promise<User> {
    ensureInitialized();

    const normalizedEmail = input.email.trim().toLowerCase();
    if (input.password.length < 6) {
      throw new Error("Firebase: Error (auth/weak-password).");
    }

    const existing = state.authUsers.find(
      (candidate) => candidate.email.toLowerCase() === normalizedEmail
    );
    if (existing) {
      throw new Error("Firebase: Error (auth/email-already-in-use).");
    }

    const uid = `user-${nextId("user")}`;
    const user: StoredAuthUser = {
      uid,
      email: normalizedEmail,
      password: input.password,
      displayName: input.displayName.trim()
    };

    state.authUsers.push(user);
    state.currentUserId = uid;
    persistState();
    notifyChannels("auth");

    return toAuthUser(user) as User;
  },

  async updateProfile(user: User, profile: { displayName?: string | null }): Promise<void> {
    ensureInitialized();

    if (!profile.displayName?.trim()) {
      return;
    }

    updateAuthUserDisplayName(user.uid, profile.displayName.trim());
    persistState();
    notifyChannels("auth");
  },

  async signOut(): Promise<void> {
    ensureInitialized();
    state.currentUserId = null;
    persistState();
    notifyChannels("auth");
  }
};

export const e2eFirestore = {
  async createUserProfile(profile: UserProfile): Promise<void> {
    ensureInitialized();
    const existingIndex = state.profiles.findIndex((candidate) => candidate.uid === profile.uid);
    if (existingIndex >= 0) {
      state.profiles[existingIndex] = cloneValue(profile);
    } else {
      state.profiles.push(cloneValue(profile));
    }
    updateAuthUserDisplayName(profile.uid, profile.displayName);
    persistState();
    notifyChannels("profiles", "auth");
  },

  async getUserProfile(uid: string): Promise<UserProfile | null> {
    ensureInitialized();
    const profile = getProfileByUid(uid);
    return profile ? cloneValue(profile) : null;
  },

  async getUserProfilesByUids(uids: string[]): Promise<Record<string, UserProfile>> {
    ensureInitialized();
    return uids.reduce<Record<string, UserProfile>>((result, uid) => {
      const profile = getProfileByUid(uid);
      if (profile) {
        result[uid] = cloneValue(profile);
      }
      return result;
    }, {});
  },

  async updateOfficialProfile(
    uid: string,
    input: {
      levelsOfficiated: UserProfile["levelsOfficiated"];
      contactInfo: NonNullable<UserProfile["contactInfo"]>;
      locationCoordinates: GeoPoint | null;
    }
  ): Promise<void> {
    ensureInitialized();
    const profile = state.profiles.find((candidate) => candidate.uid === uid);
    if (!profile || profile.role !== "official") {
      throw new Error("Official profile not found.");
    }

    profile.levelsOfficiated = cloneValue(input.levelsOfficiated ?? []);
    profile.contactInfo = cloneValue(input.contactInfo);
    profile.locationCoordinates = input.locationCoordinates ?? undefined;
    persistState();
    notifyChannels("profiles");
  },

  async searchOfficialProfilesByEmail(rawEmail: string): Promise<UserProfile[]> {
    ensureInitialized();
    const term = rawEmail.trim().toLowerCase();
    if (!term) {
      return [];
    }

    return sortProfiles(
      state.profiles.filter(
        (profile) => profile.role === "official" && profile.email.toLowerCase().includes(term)
      )
    ).map((profile) => cloneValue(profile));
  },

  subscribeGames(onChange: (games: Game[]) => void): () => void {
    ensureInitialized();
    const emit = () => onChange(sortGames(state.games).map((game) => cloneValue(game)));
    emit();
    return subscribe("games", emit);
  },

  subscribeBids(onChange: (bids: Bid[]) => void): () => void {
    ensureInitialized();
    const emit = () => onChange(sortBids(state.bids).map((bid) => cloneValue(bid)));
    emit();
    return subscribe("bids", emit);
  },

  subscribeOfficialProfiles(onChange: (profiles: UserProfile[]) => void): () => void {
    ensureInitialized();
    const emit = () => {
      onChange(
        sortProfiles(state.profiles.filter((profile) => profile.role === "official")).map(
          (profile) => cloneValue(profile)
        )
      );
    };
    emit();
    return subscribe("profiles", emit);
  },

  subscribeCrews(onChange: (crews: Crew[]) => void): () => void {
    ensureInitialized();
    const emit = () => onChange(sortCrews(state.crews).map((crew) => cloneValue(crew)));
    emit();
    return subscribe("crews", emit);
  },

  subscribeRatingsForGame(gameId: string, onChange: (ratings: Rating[]) => void): () => void {
    ensureInitialized();
    const emit = () =>
      onChange(
        state.ratings
          .filter((rating) => rating.gameId === gameId)
          .map((rating) => cloneValue(rating))
      );
    emit();
    return subscribe("ratings", emit);
  },

  subscribeEvaluationsForGame(
    gameId: string,
    onChange: (evaluations: Evaluation[]) => void
  ): () => void {
    ensureInitialized();
    const emit = () =>
      onChange(
        state.evaluations
          .filter((evaluation) => evaluation.gameId === gameId)
          .map((evaluation) => cloneValue(evaluation))
      );
    emit();
    return subscribe("evaluations", emit);
  },

  subscribeRatings(onChange: (ratings: Rating[]) => void): () => void {
    ensureInitialized();
    const emit = () => onChange(state.ratings.map((rating) => cloneValue(rating)));
    emit();
    return subscribe("ratings", emit);
  },

  async createGame(
    input: Omit<Game, "id" | "createdAtISO" | "status" | "createdByUid" | "createdByRole"> & {
      locationCoordinates?: GeoPoint | null;
    },
    createdBy: { uid: string; role: "assignor" | "school"; displayName: string }
  ): Promise<void> {
    ensureInitialized();
    state.games.push({
      id: nextId("game"),
      schoolName: input.schoolName,
      sport: input.sport,
      level: input.level,
      dateISO: input.dateISO,
      acceptingBidsUntilISO: input.acceptingBidsUntilISO,
      location: input.location,
      locationCoordinates: input.locationCoordinates ?? undefined,
      payPosted: input.payPosted,
      notes: input.notes,
      createdByUid: createdBy.uid,
      createdByName: createdBy.displayName,
      createdByRole: createdBy.role,
      createdAtISO: nowIso(),
      status: "open",
      mode: "marketplace"
    });
    persistState();
    notifyChannels("games");
  },

  async createAssignedGame(
    input: {
      schoolName: string;
      sport: Game["sport"];
      level: Game["level"];
      dateISO: string;
      location: string;
      locationCoordinates?: GeoPoint | null;
      payPosted: number;
      notes?: string;
      directAssignments: GameAssignment[];
    },
    createdBy: { uid: string; role: "assignor" | "school"; displayName: string }
  ): Promise<void> {
    ensureInitialized();
    state.games.push({
      id: nextId("game"),
      schoolName: input.schoolName,
      sport: input.sport,
      level: input.level,
      dateISO: input.dateISO,
      location: input.location,
      locationCoordinates: input.locationCoordinates ?? undefined,
      payPosted: input.payPosted,
      notes: input.notes,
      createdByUid: createdBy.uid,
      createdByName: createdBy.displayName,
      createdByRole: createdBy.role,
      createdAtISO: nowIso(),
      status: "awarded",
      mode: "direct_assignment",
      directAssignments: cloneValue(input.directAssignments),
      assignedOfficials: buildAssignedOfficialsForDirectAssignments(
        input.directAssignments,
        state.crews
      )
    });
    persistState();
    notifyChannels("games");
  },

  async updateGame(
    gameId: string,
    input: {
      schoolName: string;
      sport: Game["sport"];
      level: Game["level"];
      dateISO: string;
      acceptingBidsUntilISO?: string;
      location: string;
      locationCoordinates?: GeoPoint | null;
      payPosted: number;
      notes?: string;
    }
  ): Promise<void> {
    ensureInitialized();
    const game = state.games.find((candidate) => candidate.id === gameId);
    if (!game) {
      throw new Error("Game not found.");
    }

    game.schoolName = input.schoolName;
    game.sport = input.sport;
    game.level = input.level;
    game.dateISO = input.dateISO;
    game.acceptingBidsUntilISO = input.acceptingBidsUntilISO;
    game.location = input.location;
    game.locationCoordinates = input.locationCoordinates ?? undefined;
    game.payPosted = input.payPosted;
    game.notes = input.notes;
    persistState();
    notifyChannels("games");
  },

  async createBid(input: {
    gameId: string;
    officialUid: string;
    officialName: string;
    bidderType: "individual" | "crew";
    crewId?: string;
    baseCrewId?: string;
    crewName?: string;
    proposedRoster?: CrewRosterOfficial[];
    amount: number;
    message?: string;
  }): Promise<void> {
    ensureInitialized();
    state.bids.push({
      id: nextId("bid"),
      gameId: input.gameId,
      officialUid: input.officialUid,
      officialName: input.officialName,
      bidderType: input.bidderType,
      crewId: input.crewId,
      baseCrewId: input.baseCrewId,
      crewName: input.crewName,
      proposedRoster: input.proposedRoster ? cloneValue(input.proposedRoster) : undefined,
      amount: input.amount,
      message: input.message,
      createdAtISO: nowIso()
    });
    persistState();
    notifyChannels("bids");
  },

  async updateBid(
    bidId: string,
    input: {
      officialName: string;
      bidderType?: "individual" | "crew";
      crewId?: string;
      baseCrewId?: string;
      crewName?: string;
      proposedRoster?: CrewRosterOfficial[];
      amount: number;
      message?: string;
    }
  ): Promise<void> {
    ensureInitialized();
    const bid = state.bids.find((candidate) => candidate.id === bidId);
    if (!bid) {
      throw new Error("Bid not found.");
    }

    bid.officialName = input.officialName;
    bid.bidderType = input.bidderType ?? bid.bidderType;
    bid.crewId = input.crewId;
    bid.baseCrewId = input.baseCrewId;
    bid.crewName = input.crewName;
    bid.proposedRoster = input.proposedRoster ? cloneValue(input.proposedRoster) : undefined;
    bid.amount = input.amount;
    bid.message = input.message;
    bid.createdAtISO = nowIso();
    persistState();
    notifyChannels("bids");
  },

  async deleteBid(bidId: string): Promise<void> {
    ensureInitialized();
    state.bids = state.bids.filter((bid) => bid.id !== bidId);
    persistState();
    notifyChannels("bids");
  },

  async createCrew(
    input: {
      name: string;
      members: CrewMember[];
      memberPositions?: Partial<Record<string, FootballPosition>>;
    },
    createdBy: { uid: string; role: "official" | "assignor" | "school"; displayName: string }
  ): Promise<void> {
    ensureInitialized();
    const members = cloneValue(input.members);
    const memberPositions = cloneValue(input.memberPositions ?? {});
    const createdByMember = members.some((member) => member.uid === createdBy.uid)
      ? null
      : getCrewMember(createdBy.uid);

    const allMembers = createdByMember ? [...members, createdByMember] : members;

    state.crews.push({
      id: nextId("crew"),
      name: input.name.trim(),
      createdByUid: createdBy.uid,
      createdByName: createdBy.displayName,
      createdByRole: createdBy.role,
      createdAtISO: nowIso(),
      crewChiefUid: createdBy.uid,
      crewChiefName: createdBy.displayName,
      refereeOfficialId: deriveRefereeOfficialId(memberPositions),
      memberUids: allMembers.map((member) => member.uid),
      members: allMembers,
      memberPositions
    });
    persistState();
    notifyChannels("crews");
  },

  async deleteCrew(crewId: string): Promise<void> {
    ensureInitialized();
    state.crews = state.crews.filter((crew) => crew.id !== crewId);
    persistState();
    notifyChannels("crews");
  },

  async updateCrewMembers(crewId: string, members: CrewMember[]): Promise<void> {
    ensureInitialized();
    const crew = state.crews.find((candidate) => candidate.id === crewId);
    if (!crew) {
      throw new Error("Crew not found.");
    }

    crew.members = cloneValue(members);
    crew.memberUids = crew.members.map((member) => member.uid);
    const allowedMemberUids = new Set(crew.memberUids);
    crew.memberPositions = Object.entries(crew.memberPositions).reduce<
      Partial<Record<string, FootballPosition>>
    >((result, [uid, position]) => {
      if (allowedMemberUids.has(uid) && position) {
        result[uid] = position;
      }
      return result;
    }, {});
    crew.refereeOfficialId = deriveRefereeOfficialId(crew.memberPositions);
    persistState();
    notifyChannels("crews");
  },

  async updateCrewChief(
    crewId: string,
    chief: Pick<CrewMember, "uid" | "name">
  ): Promise<void> {
    ensureInitialized();
    const crew = state.crews.find((candidate) => candidate.id === crewId);
    if (!crew) {
      throw new Error("Crew not found.");
    }

    crew.crewChiefUid = chief.uid;
    crew.crewChiefName = chief.name;
    persistState();
    notifyChannels("crews");
  },

  async updateCrewMemberPositions(
    crewId: string,
    memberPositions: Partial<Record<string, FootballPosition>>
  ): Promise<void> {
    ensureInitialized();
    const crew = state.crews.find((candidate) => candidate.id === crewId);
    if (!crew) {
      throw new Error("Crew not found.");
    }

    crew.memberPositions = cloneValue(memberPositions);
    crew.refereeOfficialId = deriveRefereeOfficialId(memberPositions);
    persistState();
    notifyChannels("crews");
  },

  async upsertGameRating(
    input: {
      gameId: string;
      targetType: RatingTargetType;
      targetId: string;
      stars: number;
      comment?: string;
    },
    ratedBy: { uid: string; role: "assignor" | "school" | "official" }
  ): Promise<void> {
    ensureInitialized();
    const existing = state.ratings.find(
      (rating) =>
        rating.gameId === input.gameId &&
        rating.targetType === input.targetType &&
        rating.targetId === input.targetId &&
        rating.ratedByUid === ratedBy.uid
    );

    if (existing) {
      existing.stars = input.stars;
      existing.comment = input.comment;
      existing.updatedAtISO = nowIso();
    } else {
      state.ratings.push({
        id: nextId("rating"),
        gameId: input.gameId,
        targetType: input.targetType,
        targetId: input.targetId,
        ratedByUid: ratedBy.uid,
        ratedByRole: ratedBy.role,
        stars: input.stars,
        comment: input.comment,
        createdAtISO: nowIso(),
        updatedAtISO: nowIso()
      });
    }

    persistState();
    notifyChannels("ratings");
  },

  async upsertGameEvaluation(
    input: {
      gameId: string;
      overallScore: number;
      notes?: string;
    },
    evaluator: { uid: string }
  ): Promise<void> {
    ensureInitialized();
    const existing = state.evaluations.find(
      (evaluation) =>
        evaluation.gameId === input.gameId && evaluation.evaluatorUid === evaluator.uid
    );

    if (existing) {
      existing.overallScore = input.overallScore;
      existing.notes = input.notes;
      existing.updatedAtISO = nowIso();
    } else {
      state.evaluations.push({
        id: nextId("evaluation"),
        gameId: input.gameId,
        evaluatorUid: evaluator.uid,
        overallScore: input.overallScore,
        notes: input.notes,
        createdAtISO: nowIso(),
        updatedAtISO: nowIso()
      });
    }

    persistState();
    notifyChannels("evaluations");
  },

  async selectBid(gameId: string, bidId: string): Promise<void> {
    ensureInitialized();
    const game = state.games.find((candidate) => candidate.id === gameId);
    const bid = state.bids.find((candidate) => candidate.id === bidId);
    if (!game || !bid) {
      throw new Error("Game or bid not found.");
    }

    game.status = "awarded";
    game.selectedBidId = bid.id;
    game.awardedCrewId = bid.bidderType === "crew" ? bid.baseCrewId ?? bid.crewId : undefined;
    game.assignedOfficials = buildAssignedOfficialsForBid(bid, state.crews);
    persistState();
    notifyChannels("games", "bids");
  },

  async deleteGame(gameId: string): Promise<void> {
    ensureInitialized();
    state.games = state.games.filter((game) => game.id !== gameId);
    state.bids = state.bids.filter((bid) => bid.gameId !== gameId);
    state.ratings = state.ratings.filter((rating) => rating.gameId !== gameId);
    state.evaluations = state.evaluations.filter((evaluation) => evaluation.gameId !== gameId);
    persistState();
    notifyChannels("games", "bids", "ratings", "evaluations");
  }
};

export const e2eGooglePlaces = {
  hasGooglePlacesApiKey(): boolean {
    return false;
  },

  async ensureGooglePlacesLoaded(): Promise<boolean> {
    return false;
  },

  async getCoordinatesForAddress(address: string): Promise<GeoPoint | null> {
    ensureInitialized();
    return createPointFromAddress(address);
  },

  async getDistanceMilesBetweenAddresses(
    originAddress: string,
    destinationAddress: string
  ): Promise<number | null> {
    const origin = createPointFromAddress(originAddress);
    const destination = createPointFromAddress(destinationAddress);
    if (!origin || !destination) {
      return null;
    }
    return computeDistanceMiles(origin, destination);
  },

  async getDistanceMilesFromCoordinatesToAddress(
    origin: GeoPoint,
    destinationAddress: string
  ): Promise<number | null> {
    const destination = createPointFromAddress(destinationAddress);
    if (!destination) {
      return null;
    }
    return computeDistanceMiles(origin, destination);
  },

  async getLocationSuggestions(input: string): Promise<Array<{ placeId: string; description: string }>> {
    const trimmed = input.trim();
    if (!trimmed) {
      return [];
    }

    return [
      {
        placeId: trimmed.toLowerCase().replace(/\s+/g, "-"),
        description: trimmed
      }
    ];
  }
};

export function getE2EDistanceBetweenPoints(origin: GeoPoint, destination: GeoPoint): number {
  return computeDistanceMiles(origin, destination);
}

const admin = require("firebase-admin");
const { FieldValue, initializeFirestore } = require("firebase-admin/firestore");
const { setGlobalOptions } = require("firebase-functions/v2");
const { onCall, HttpsError } = require("firebase-functions/v2/https");

admin.initializeApp();

const configuredDatabaseId = (process.env.FIRESTORE_DATABASE_ID || "(default)").trim();
const functionsRegion = trimString(process.env.FUNCTIONS_REGION) || "us-central1";
const useDefaultFirestoreDatabase =
  !configuredDatabaseId ||
  configuredDatabaseId === "(default)";
const db = useDefaultFirestoreDatabase
  ? initializeFirestore(admin.app(), { preferRest: true })
  : initializeFirestore(admin.app(), { preferRest: true }, configuredDatabaseId);

const GAMES_COLLECTION = "games";
const BIDS_COLLECTION = "bids";
const CREWS_COLLECTION = "crews";
const RATINGS_COLLECTION = "ratings";
const EVALUATIONS_COLLECTION = "evaluations";
const USER_PROFILES_COLLECTION = "userProfiles";

const USER_ROLES = new Set(["official", "assignor", "school", "evaluator"]);
const CREW_OWNER_ROLES = new Set(["official", "assignor", "school"]);
const SPORTS = new Set(["Football", "Basketball", "Soccer", "Baseball"]);
const LEVELS = new Set(["NCAA", "Varsity", "Junior Varsity", "Middle School", "Youth"]);
const OFFICIATING_LEVELS = new Set([
  "Varsity",
  "Sub Varsity",
  "NCAA DI",
  "NCAA DII",
  "NCAA DIII"
]);
const GAME_STATUSES = new Set(["open", "awarded"]);
const GAME_MODES = new Set(["marketplace", "direct_assignment"]);
const BIDDER_TYPES = new Set(["individual", "crew"]);
const RATING_TARGET_TYPES = new Set(["official", "crew", "school", "venue"]);
const FOOTBALL_POSITIONS = new Set([
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
]);

function parseBoolean(value) {
  return ["1", "true", "yes", "on"].includes(trimString(value).toLowerCase());
}

function unique(values) {
  return Array.from(new Set(values.filter(Boolean)));
}

function parseCallableCorsOrigins() {
  const configuredOrigins = trimString(process.env.CALLABLE_ALLOWED_ORIGINS);
  if (configuredOrigins) {
    return unique(
      configuredOrigins
        .split(",")
        .map((value) => value.trim())
        .filter(Boolean)
    );
  }

  return [
    "http://localhost:3000",
    "http://127.0.0.1:3000",
    "http://localhost:4173",
    "http://127.0.0.1:4173",
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "http://localhost:5174",
    "http://127.0.0.1:5174",
    "https://officiating-marketplace-487319.firebaseapp.com",
    "https://officiating-marketplace-487319.web.app"
  ];
}

const callableCorsOrigins = parseCallableCorsOrigins();
const enforceCallableAppCheck = parseBoolean(process.env.ENFORCE_CALLABLE_APP_CHECK);

setGlobalOptions({
  region: functionsRegion,
  invoker: "public"
});

const callableOptions = {
  cors: callableCorsOrigins,
  enforceAppCheck: enforceCallableAppCheck
};

function onClientCall(handler) {
  return onCall(callableOptions, handler);
}

function assert(condition, code, message) {
  if (!condition) {
    throw new HttpsError(code, message);
  }
}

function trimString(value) {
  return typeof value === "string" ? value.trim() : "";
}

function asIsoString(value, fieldName) {
  const iso = trimString(value);
  assert(iso, "invalid-argument", `${fieldName} is required.`);
  const date = new Date(iso);
  assert(!Number.isNaN(date.getTime()), "invalid-argument", `${fieldName} must be a valid ISO date.`);
  return date.toISOString();
}

function asOptionalIsoString(value, fieldName) {
  const trimmed = trimString(value);
  if (!trimmed) {
    return "";
  }
  return asIsoString(trimmed, fieldName);
}

function requireAuth(request) {
  assert(request.auth, "unauthenticated", "Authentication is required.");
  return request.auth.uid;
}

async function getRequesterProfile(request) {
  const uid = requireAuth(request);
  const snapshot = await db.collection(USER_PROFILES_COLLECTION).doc(uid).get();
  assert(snapshot.exists, "failed-precondition", "Complete your user profile before using the API.");
  const profile = normalizeUserProfile(snapshot.id, snapshot.data());
  return profile;
}

function normalizeUserProfile(id, data) {
  if (!data || typeof data !== "object") {
    return null;
  }

  const email = trimString(data.email);
  return {
    uid: trimString(data.uid) || id,
    email,
    emailLowercase: trimString(data.emailLowercase) || email.toLowerCase(),
    displayName: trimString(data.displayName),
    role: trimString(data.role),
    createdAtISO: trimString(data.createdAtISO),
    levelsOfficiated: Array.isArray(data.levelsOfficiated)
      ? data.levelsOfficiated.filter((level) => OFFICIATING_LEVELS.has(level))
      : [],
    contactInfo:
      data.contactInfo && typeof data.contactInfo === "object"
        ? {
            addressLine1: trimString(data.contactInfo.addressLine1),
            addressLine2: trimString(data.contactInfo.addressLine2),
            city: trimString(data.contactInfo.city),
            state: trimString(data.contactInfo.state),
            postalCode: trimString(data.contactInfo.postalCode)
          }
        : undefined,
    locationCoordinates: normalizeGeoPoint(data.locationCoordinates) || undefined
  };
}

function normalizeGeoPoint(value) {
  if (!value || typeof value !== "object") {
    return null;
  }

  const lat =
    typeof value.lat === "number"
      ? value.lat
      : typeof value.latitude === "number"
        ? value.latitude
        : null;
  const lng =
    typeof value.lng === "number"
      ? value.lng
      : typeof value.longitude === "number"
        ? value.longitude
        : null;

  assert(
    lat === null || Number.isFinite(lat),
    "invalid-argument",
    "locationCoordinates.lat must be a number."
  );
  assert(
    lng === null || Number.isFinite(lng),
    "invalid-argument",
    "locationCoordinates.lng must be a number."
  );

  if (lat === null || lng === null) {
    return null;
  }

  return { lat, lng };
}

function normalizeCrewMember(member) {
  const uid = trimString(member && member.uid);
  const name = trimString(member && member.name);
  const email = trimString(member && member.email);

  assert(uid, "invalid-argument", "Crew member uid is required.");
  assert(name, "invalid-argument", "Crew member name is required.");
  assert(email, "invalid-argument", "Crew member email is required.");

  return { uid, name, email };
}

function normalizeCrewMemberPositions(rawPositions, memberUids) {
  const normalized = {};
  if (!rawPositions || typeof rawPositions !== "object") {
    return normalized;
  }

  const memberUidSet = new Set(memberUids);
  Object.entries(rawPositions).forEach(([uid, rawPosition]) => {
    if (!memberUidSet.has(uid) || typeof rawPosition !== "string") {
      return;
    }
    if (!FOOTBALL_POSITIONS.has(rawPosition)) {
      return;
    }
    normalized[uid] = rawPosition;
  });

  return normalized;
}

function assertSingleCrewReferee(memberPositions) {
  const refereeCount = Object.values(memberPositions).filter((position) => position === "R").length;
  assert(refereeCount <= 1, "invalid-argument", "Only one crew member can be assigned as Referee.");
}

function getRefereeOfficialIdFromMemberPositions(memberPositions) {
  const refereeEntries = Object.entries(memberPositions).filter(([, position]) => position === "R");
  return refereeEntries.length === 1 ? refereeEntries[0][0] : "";
}

function normalizeRosterOfficial(rawOfficial) {
  assert(rawOfficial && typeof rawOfficial === "object", "invalid-argument", "Roster official is required.");
  const officialUid = trimString(rawOfficial.officialUid || rawOfficial.officialId);
  const officialName = trimString(rawOfficial.officialName);
  const officialEmail = trimString(rawOfficial.officialEmail);
  const role = trimString(rawOfficial.role);
  const source = trimString(rawOfficial.source);

  assert(officialUid, "invalid-argument", "Roster official uid is required.");
  assert(officialName, "invalid-argument", "Roster official name is required.");
  if (role) {
    assert(FOOTBALL_POSITIONS.has(role), "invalid-argument", "Invalid roster role.");
  }
  assert(
    !source || source === "baseCrew" || source === "alternate",
    "invalid-argument",
    "Roster source must be baseCrew or alternate."
  );

  return {
    officialUid,
    officialName,
    ...(officialEmail ? { officialEmail } : {}),
    ...(role ? { role } : {}),
    source: source === "alternate" ? "alternate" : "baseCrew",
    baseCrewMember: Boolean(rawOfficial.baseCrewMember)
  };
}

function normalizeStoredRoster(rawRoster) {
  return Array.isArray(rawRoster) ? rawRoster.map(normalizeRosterOfficial) : [];
}

function normalizeGameAssignment(assignment) {
  assert(assignment && typeof assignment === "object", "invalid-argument", "Assignment is required.");
  const assignmentType = trimString(assignment.assignmentType);

  if (assignmentType === "individual") {
    const position = trimString(assignment.position);
    if (position) {
      assert(FOOTBALL_POSITIONS.has(position), "invalid-argument", "Invalid football position.");
    }

    return {
      assignmentType: "individual",
      officialUid: trimString(assignment.officialUid),
      officialName: trimString(assignment.officialName),
      officialEmail: trimString(assignment.officialEmail),
      ...(position ? { position } : {})
    };
  }

  assert(assignmentType === "crew", "invalid-argument", "Assignment type must be individual or crew.");
  assert(Array.isArray(assignment.memberUids), "invalid-argument", "Crew assignment memberUids are required.");
  assert(Array.isArray(assignment.memberNames), "invalid-argument", "Crew assignment memberNames are required.");

  return {
    assignmentType: "crew",
    crewId: trimString(assignment.crewId),
    crewName: trimString(assignment.crewName),
    memberUids: assignment.memberUids.map((uid) => trimString(uid)).filter(Boolean),
    memberNames: assignment.memberNames.map((name) => trimString(name)).filter(Boolean)
  };
}

function normalizeGameDocument(id, data) {
  return {
    id,
    schoolName: trimString(data.schoolName),
    sport: trimString(data.sport),
    level: trimString(data.level),
    requestedCrewSize:
      typeof data.requestedCrewSize === "number" && Number.isFinite(data.requestedCrewSize)
        ? data.requestedCrewSize
        : undefined,
    dateISO: trimString(data.dateISO),
    acceptingBidsUntilISO: trimString(data.acceptingBidsUntilISO) || undefined,
    location: trimString(data.location),
    locationCoordinates: normalizeGeoPoint(data.locationCoordinates) || undefined,
    payPosted: typeof data.payPosted === "number" ? data.payPosted : 0,
    notes: trimString(data.notes) || undefined,
    createdByUid: trimString(data.createdByUid),
    createdByName: trimString(data.createdByName) || undefined,
    createdByRole: trimString(data.createdByRole),
    createdAtISO: trimString(data.createdAtISO),
    status: trimString(data.status),
    mode: trimString(data.mode) || undefined,
    directAssignments: Array.isArray(data.directAssignments) ? data.directAssignments : undefined,
    selectedBidId: trimString(data.selectedBidId) || undefined,
    awardedCrewId: trimString(data.awardedCrewId) || undefined,
    assignedOfficials: normalizeStoredRoster(data.assignedOfficials)
  };
}

function normalizeBidDocument(id, data) {
  return {
    id,
    gameId: trimString(data.gameId),
    officialUid: trimString(data.officialUid),
    createdByOfficialId: trimString(data.createdByOfficialId) || undefined,
    officialName: trimString(data.officialName),
    bidderType: trimString(data.bidderType) || undefined,
    crewId: trimString(data.crewId) || undefined,
    baseCrewId: trimString(data.baseCrewId) || undefined,
    crewName: trimString(data.crewName) || undefined,
    proposedRoster: normalizeStoredRoster(data.proposedRoster),
    amount: typeof data.amount === "number" ? data.amount : 0,
    message: trimString(data.message) || undefined,
    createdAtISO: trimString(data.createdAtISO)
  };
}

function normalizeCrewDocument(id, data) {
  const memberUids = Array.isArray(data.memberUids)
    ? data.memberUids.map((uid) => trimString(uid)).filter(Boolean)
    : [];
  const memberPositions = normalizeCrewMemberPositions(data.memberPositions, memberUids);
  return {
    id,
    name: trimString(data.name),
    createdByUid: trimString(data.createdByUid),
    createdByName: trimString(data.createdByName),
    createdByRole: trimString(data.createdByRole),
    createdAtISO: trimString(data.createdAtISO),
    crewChiefUid: trimString(data.crewChiefUid) || trimString(data.createdByUid),
    crewChiefName: trimString(data.crewChiefName) || trimString(data.createdByName),
    refereeOfficialId:
      trimString(data.refereeOfficialId) || getRefereeOfficialIdFromMemberPositions(memberPositions) || undefined,
    memberUids,
    members: Array.isArray(data.members) ? data.members.map(normalizeCrewMember) : [],
    memberPositions
  };
}

function normalizeRatingDocument(id, data) {
  return {
    id,
    gameId: trimString(data.gameId),
    targetType: trimString(data.targetType),
    targetId: trimString(data.targetId),
    ratedByUid: trimString(data.ratedByUid),
    ratedByRole: trimString(data.ratedByRole),
    stars: typeof data.stars === "number" ? data.stars : 0,
    comment: trimString(data.comment) || undefined,
    createdAtISO: trimString(data.createdAtISO),
    updatedAtISO: trimString(data.updatedAtISO)
  };
}

function normalizeEvaluationDocument(id, data) {
  return {
    id,
    gameId: trimString(data.gameId),
    evaluatorUid: trimString(data.evaluatorUid),
    overallScore: typeof data.overallScore === "number" ? data.overallScore : 0,
    notes: trimString(data.notes) || undefined,
    createdAtISO: trimString(data.createdAtISO),
    updatedAtISO: trimString(data.updatedAtISO)
  };
}

function assertRole(profile, roles) {
  assert(roles.includes(profile.role), "permission-denied", "You do not have access to this action.");
}

function validateNewGameInput(input, requireBidWindow) {
  assert(input && typeof input === "object", "invalid-argument", "Game input is required.");
  const sport = trimString(input.sport);
  const level = trimString(input.level);
  const schoolName = trimString(input.schoolName);
  const location = trimString(input.location);
  const notes = trimString(input.notes);
  const requestedCrewSize =
    typeof input.requestedCrewSize === "number" && Number.isFinite(input.requestedCrewSize)
      ? input.requestedCrewSize
      : null;
  const acceptingBidsUntilISO = asOptionalIsoString(input.acceptingBidsUntilISO, "acceptingBidsUntilISO");
  const locationCoordinates = normalizeGeoPoint(input.locationCoordinates);

  assert(SPORTS.has(sport), "invalid-argument", "Invalid sport.");
  assert(LEVELS.has(level), "invalid-argument", "Invalid level.");
  assert(schoolName, "invalid-argument", "School name is required.");
  assert(location, "invalid-argument", "Location is required.");
  assert(typeof input.payPosted === "number" && Number.isFinite(input.payPosted), "invalid-argument", "Posted pay must be a number.");
  assert(input.payPosted >= 0, "invalid-argument", "Posted pay must be zero or greater.");
  assert(requestedCrewSize !== null, "invalid-argument", "requestedCrewSize is required.");
  assert(
    Number.isInteger(requestedCrewSize) && requestedCrewSize > 0 && requestedCrewSize <= 12,
    "invalid-argument",
    "requestedCrewSize must be a whole number from 1 to 12."
  );
  assert(asIsoString(input.dateISO, "dateISO"), "invalid-argument", "dateISO is required.");

  if (requireBidWindow) {
    assert(acceptingBidsUntilISO || acceptingBidsUntilISO === "", "invalid-argument", "Invalid acceptingBidsUntilISO value.");
  }

  return {
    schoolName,
    sport,
    level,
    requestedCrewSize,
    dateISO: asIsoString(input.dateISO, "dateISO"),
    acceptingBidsUntilISO,
    location,
    locationCoordinates,
    payPosted: input.payPosted,
    notes
  };
}

function isBidWindowClosed(game) {
  if (game.status !== "open") {
    return true;
  }
  if (game.mode === "direct_assignment") {
    return true;
  }
  if (!game.acceptingBidsUntilISO) {
    return false;
  }
  return new Date(game.acceptingBidsUntilISO).getTime() <= Date.now();
}

function requiresCrewBidForGame(game) {
  return game.level === "Varsity";
}

function getCrewRefereeOfficialId(crew) {
  return trimString(crew.refereeOfficialId) || getRefereeOfficialIdFromMemberPositions(crew.memberPositions);
}

function buildDefaultCrewRoster(crew) {
  return crew.members.map((member) => ({
    officialUid: member.uid,
    officialName: member.name,
    officialEmail: member.email,
    ...(crew.memberPositions[member.uid] ? { role: crew.memberPositions[member.uid] } : {}),
    source: "baseCrew",
    baseCrewMember: true
  }));
}

async function getCrewById(crewId) {
  const snapshot = await db.collection(CREWS_COLLECTION).doc(crewId).get();
  assert(snapshot.exists, "not-found", "Crew not found.");
  return normalizeCrewDocument(snapshot.id, snapshot.data());
}

async function getGameById(gameId) {
  const snapshot = await db.collection(GAMES_COLLECTION).doc(gameId).get();
  assert(snapshot.exists, "not-found", "Game not found.");
  return normalizeGameDocument(snapshot.id, snapshot.data());
}

async function getBidById(bidId) {
  const snapshot = await db.collection(BIDS_COLLECTION).doc(bidId).get();
  assert(snapshot.exists, "not-found", "Bid not found.");
  return normalizeBidDocument(snapshot.id, snapshot.data());
}

async function getOfficialProfilesByUids(uids) {
  const uniqueUids = Array.from(new Set(uids.map((uid) => trimString(uid)).filter(Boolean)));
  const snapshots = await Promise.all(
    uniqueUids.map((uid) => db.collection(USER_PROFILES_COLLECTION).doc(uid).get())
  );
  const profilesByUid = new Map();

  snapshots.forEach((snapshot, index) => {
    const uid = uniqueUids[index];
    assert(snapshot.exists, "invalid-argument", `Official profile not found for ${uid}.`);
    const profile = normalizeUserProfile(snapshot.id, snapshot.data());
    assert(profile && profile.role === "official", "invalid-argument", `Official profile not found for ${uid}.`);
    profilesByUid.set(uid, profile);
  });

  return profilesByUid;
}

async function normalizeProposedRoster(rawRoster, crew) {
  const inputRoster = Array.isArray(rawRoster) ? rawRoster : buildDefaultCrewRoster(crew);
  const normalizedInputRoster = inputRoster.map(normalizeRosterOfficial);
  assert(normalizedInputRoster.length > 0, "invalid-argument", "Crew bids must include at least one roster official.");

  assertNoDuplicateRosterOfficials(normalizedInputRoster);

  const officialProfilesByUid = await getOfficialProfilesByUids(
    normalizedInputRoster.map((official) => official.officialUid)
  );
  const baseCrewMemberIds = new Set(crew.memberUids);

  return normalizedInputRoster.map((official) => {
    const officialProfile = officialProfilesByUid.get(official.officialUid);
    return {
      officialUid: official.officialUid,
      officialName: officialProfile.displayName,
      officialEmail: officialProfile.email,
      ...(official.role ? { role: official.role } : {}),
      source: baseCrewMemberIds.has(official.officialUid) ? "baseCrew" : "alternate",
      baseCrewMember: baseCrewMemberIds.has(official.officialUid)
    };
  });
}

function assertNoDuplicateRosterOfficials(roster) {
  const duplicateRosterEntries = Array.from(
    roster.reduce((duplicates, rosterOfficial) => {
      const nextCount = (duplicates.get(rosterOfficial.officialUid) ?? 0) + 1;
      duplicates.set(rosterOfficial.officialUid, nextCount);
      return duplicates;
    }, new Map())
  )
    .filter(([, count]) => count > 1)
    .map(([uid]) => uid);
  assert(
    duplicateRosterEntries.length === 0,
    "invalid-argument",
    "Roster contains duplicate officials."
  );
}

function getGameWindow(game) {
  const startMs = new Date(game.dateISO).getTime();
  assert(!Number.isNaN(startMs), "failed-precondition", "Game has an invalid scheduled date.");
  return {
    startMs,
    endMs: startMs + 180 * 60 * 1000
  };
}

function gameWindowsOverlap(leftGame, rightGame) {
  const leftWindow = getGameWindow(leftGame);
  const rightWindow = getGameWindow(rightGame);
  return leftWindow.startMs < rightWindow.endMs && rightWindow.startMs < leftWindow.endMs;
}

function buildAssignedOfficialsFromDirectAssignments(game, crewsById) {
  return (game.directAssignments ?? []).flatMap((assignment) => {
    if (assignment.assignmentType === "individual") {
      return [
        {
          officialUid: assignment.officialUid,
          officialName: assignment.officialName,
          officialEmail: assignment.officialEmail,
          ...(assignment.position ? { role: assignment.position } : {}),
          source: "alternate",
          baseCrewMember: false
        }
      ];
    }

    const assignedCrew = crewsById.get(assignment.crewId);
    return assignment.memberUids.map((memberUid, index) => {
      const matchingCrewMember = assignedCrew?.members.find((member) => member.uid === memberUid);
      return {
        officialUid: memberUid,
        officialName: assignment.memberNames[index] || matchingCrewMember?.name || "Official",
        ...(matchingCrewMember?.email ? { officialEmail: matchingCrewMember.email } : {}),
        ...(assignedCrew?.memberPositions?.[memberUid]
          ? { role: assignedCrew.memberPositions[memberUid] }
          : {}),
        source: "baseCrew",
        baseCrewMember: true
      };
    });
  });
}

function buildAssignedOfficialsFromBid(bid, crewsById) {
  if (!bid) {
    return [];
  }

  if (bid.bidderType !== "crew") {
    return [
      {
        officialUid: bid.officialUid,
        officialName: bid.officialName,
        source: "alternate",
        baseCrewMember: false
      }
    ];
  }

  if (bid.proposedRoster?.length) {
    return bid.proposedRoster;
  }

  const awardedCrew = bid.crewId ? crewsById.get(bid.crewId) : null;
  return awardedCrew ? buildDefaultCrewRoster(awardedCrew) : [];
}

async function checkRosterConflicts(input) {
  const targetGame = input.game;
  const rosterOfficialUids = Array.from(
    new Set(input.roster.map((official) => trimString(official.officialUid)).filter(Boolean))
  );

  if (rosterOfficialUids.length === 0) {
    return { hasConflict: false, conflicts: [] };
  }

  const [gamesSnapshot, bidsSnapshot, crewsSnapshot] = await Promise.all([
    db.collection(GAMES_COLLECTION).where("status", "==", "awarded").get(),
    db.collection(BIDS_COLLECTION).get(),
    db.collection(CREWS_COLLECTION).get()
  ]);
  const bidsById = new Map(
    bidsSnapshot.docs.map((doc) => {
      const bid = normalizeBidDocument(doc.id, doc.data());
      return [bid.id, bid];
    })
  );
  const crewsById = new Map(
    crewsSnapshot.docs.map((doc) => {
      const crew = normalizeCrewDocument(doc.id, doc.data());
      return [crew.id, crew];
    })
  );

  const conflicts = [];
  gamesSnapshot.docs.forEach((doc) => {
    const otherGame = normalizeGameDocument(doc.id, doc.data());
    if (otherGame.id === input.ignoreGameId) {
      return;
    }
    if (!gameWindowsOverlap(targetGame, otherGame)) {
      return;
    }

    const otherAssignedOfficials =
      otherGame.assignedOfficials?.length
        ? otherGame.assignedOfficials
        : otherGame.mode === "direct_assignment"
          ? buildAssignedOfficialsFromDirectAssignments(otherGame, crewsById)
          : buildAssignedOfficialsFromBid(
              otherGame.selectedBidId ? bidsById.get(otherGame.selectedBidId) ?? null : null,
              crewsById
            );

    otherAssignedOfficials.forEach((assignedOfficial) => {
      if (!rosterOfficialUids.includes(assignedOfficial.officialUid)) {
        return;
      }

      const otherWindow = getGameWindow(otherGame);
      conflicts.push({
        officialUid: assignedOfficial.officialUid,
        conflictingGameId: otherGame.id,
        conflictingStartISO: new Date(otherWindow.startMs).toISOString(),
        conflictingEndISO: new Date(otherWindow.endMs).toISOString()
      });
    });
  });

  return {
    hasConflict: conflicts.length > 0,
    conflicts
  };
}

function canManageCrew(crew, uid) {
  return crew.createdByUid === uid || crew.crewChiefUid === uid;
}

function canBidWithCrew(crew, uid) {
  return getCrewRefereeOfficialId(crew) === uid;
}

async function canEditExistingBid(bid, uid) {
  if (!bid || bid.bidderType !== "crew") {
    return Boolean(bid && bid.officialUid === uid);
  }

  const crewId = trimString(bid.baseCrewId) || trimString(bid.crewId);
  if (!crewId) {
    return false;
  }

  const crew = await getCrewById(crewId);
  return canBidWithCrew(crew, uid);
}

exports.createUserProfile = onClientCall(async (request) => {
  const uid = requireAuth(request);
  const input = request.data && request.data.profile;
  assert(input && typeof input === "object", "invalid-argument", "Profile payload is required.");

  const email = trimString(request.auth.token.email) || trimString(input.email);
  const displayName = trimString(input.displayName) || trimString(request.auth.token.name);
  const role = trimString(input.role);
  const createdAtISO = trimString(input.createdAtISO) || new Date().toISOString();

  assert(USER_ROLES.has(role), "invalid-argument", "Invalid user role.");
  assert(email, "invalid-argument", "Email is required.");
  assert(displayName, "invalid-argument", "Display name is required.");

  await db.collection(USER_PROFILES_COLLECTION).doc(uid).set({
    uid,
    email,
    emailLowercase: email.toLowerCase(),
    displayName,
    role,
    createdAtISO
  });
  return { ok: true };
});

exports.getUserProfile = onClientCall(async (request) => {
  const requesterUid = requireAuth(request);
  const requestedUid = trimString(request.data && request.data.uid) || requesterUid;

  if (requestedUid !== requesterUid) {
    await getRequesterProfile(request);
  }

  const snapshot = await db.collection(USER_PROFILES_COLLECTION).doc(requestedUid).get();
  if (!snapshot.exists) {
    return null;
  }
  return normalizeUserProfile(snapshot.id, snapshot.data());
});

exports.getUserProfilesByUids = onClientCall(async (request) => {
  await getRequesterProfile(request);
  const uids = Array.isArray(request.data && request.data.uids)
    ? request.data.uids.map((uid) => trimString(uid)).filter(Boolean)
    : [];
  const uniqueUids = Array.from(new Set(uids)).slice(0, 50);
  if (uniqueUids.length === 0) {
    return {};
  }

  const snapshots = await Promise.all(
    uniqueUids.map((uid) => db.collection(USER_PROFILES_COLLECTION).doc(uid).get())
  );

  return snapshots.reduce((accumulator, snapshot) => {
    if (snapshot.exists) {
      const profile = normalizeUserProfile(snapshot.id, snapshot.data());
      accumulator[profile.uid] = profile;
    }
    return accumulator;
  }, {});
});

exports.updateOfficialProfile = onClientCall(async (request) => {
  const profile = await getRequesterProfile(request);
  const uid = trimString(request.data && request.data.uid);
  assert(uid === profile.uid, "permission-denied", "You can only update your own profile.");
  assert(profile.role === "official", "permission-denied", "Only officials can update official profile details.");

  const input = request.data && request.data.input;
  assert(input && typeof input === "object", "invalid-argument", "Profile update input is required.");

  const normalizedLevels = Array.isArray(input.levelsOfficiated)
    ? Array.from(new Set(input.levelsOfficiated.filter((level) => OFFICIATING_LEVELS.has(level))))
    : [];
  const contactInfo = input.contactInfo && typeof input.contactInfo === "object" ? input.contactInfo : {};
  const normalizedContactInfo = {
    addressLine1: trimString(contactInfo.addressLine1),
    addressLine2: trimString(contactInfo.addressLine2),
    city: trimString(contactInfo.city),
    state: trimString(contactInfo.state),
    postalCode: trimString(contactInfo.postalCode)
  };
  const hasContactInfo = Object.values(normalizedContactInfo).some(Boolean);
  const locationCoordinates = normalizeGeoPoint(input.locationCoordinates);

  const payload = {
    levelsOfficiated: normalizedLevels,
    contactInfo: hasContactInfo ? normalizedContactInfo : FieldValue.delete(),
    locationCoordinates: hasContactInfo && locationCoordinates ? locationCoordinates : FieldValue.delete()
  };

  await db.collection(USER_PROFILES_COLLECTION).doc(uid).update(payload);
  return { ok: true };
});

exports.searchOfficialProfilesByEmail = onClientCall(async (request) => {
  const profile = await getRequesterProfile(request);
  assert(
    profile.role === "official" || profile.role === "assignor" || profile.role === "school",
    "permission-denied",
    "Only officials, assignors, and schools can search officials."
  );

  const email = trimString(request.data && request.data.email);
  if (!email) {
    return [];
  }

  const lowercaseEmail = email.toLowerCase();
  const [byLowercaseSnapshot, byEmailSnapshot] = await Promise.all([
    db
      .collection(USER_PROFILES_COLLECTION)
      .where("emailLowercase", "==", lowercaseEmail)
      .limit(5)
      .get(),
    db.collection(USER_PROFILES_COLLECTION).where("email", "==", email).limit(5).get()
  ]);

  const merged = new Map();
  [...byLowercaseSnapshot.docs, ...byEmailSnapshot.docs].forEach((snapshot) => {
    const nextProfile = normalizeUserProfile(snapshot.id, snapshot.data());
    if (nextProfile.role === "official") {
      merged.set(nextProfile.uid, nextProfile);
    }
  });

  return Array.from(merged.values()).sort((left, right) =>
    left.displayName.localeCompare(right.displayName)
  );
});

exports.listGames = onClientCall(async (request) => {
  await getRequesterProfile(request);
  const snapshot = await db.collection(GAMES_COLLECTION).orderBy("dateISO", "asc").get();
  return snapshot.docs.map((doc) => normalizeGameDocument(doc.id, doc.data()));
});

exports.listBids = onClientCall(async (request) => {
  await getRequesterProfile(request);
  const snapshot = await db.collection(BIDS_COLLECTION).orderBy("createdAtISO", "desc").get();
  return snapshot.docs.map((doc) => normalizeBidDocument(doc.id, doc.data()));
});

exports.listCrews = onClientCall(async (request) => {
  await getRequesterProfile(request);
  const snapshot = await db.collection(CREWS_COLLECTION).orderBy("createdAtISO", "desc").get();
  return snapshot.docs.map((doc) => normalizeCrewDocument(doc.id, doc.data()));
});

exports.listOfficialProfiles = onClientCall(async (request) => {
  await getRequesterProfile(request);
  const snapshot = await db.collection(USER_PROFILES_COLLECTION).get();
  return snapshot.docs
    .map((doc) => normalizeUserProfile(doc.id, doc.data()))
    .filter((profile) => profile.role === "official")
    .sort((left, right) => left.displayName.localeCompare(right.displayName));
});

exports.listRatings = onClientCall(async (request) => {
  await getRequesterProfile(request);
  const snapshot = await db.collection(RATINGS_COLLECTION).orderBy("updatedAtISO", "desc").get();
  return snapshot.docs.map((doc) => normalizeRatingDocument(doc.id, doc.data()));
});

exports.listRatingsForGame = onClientCall(async (request) => {
  await getRequesterProfile(request);
  const gameId = trimString(request.data && request.data.gameId);
  assert(gameId, "invalid-argument", "gameId is required.");
  const snapshot = await db.collection(RATINGS_COLLECTION).where("gameId", "==", gameId).get();
  return snapshot.docs.map((doc) => normalizeRatingDocument(doc.id, doc.data()));
});

exports.listEvaluationsForGame = onClientCall(async (request) => {
  await getRequesterProfile(request);
  const gameId = trimString(request.data && request.data.gameId);
  assert(gameId, "invalid-argument", "gameId is required.");
  const snapshot = await db
    .collection(EVALUATIONS_COLLECTION)
    .where("gameId", "==", gameId)
    .get();
  return snapshot.docs.map((doc) => normalizeEvaluationDocument(doc.id, doc.data()));
});

exports.createGame = onClientCall(async (request) => {
  const profile = await getRequesterProfile(request);
  assertRole(profile, ["assignor", "school"]);

  const input = validateNewGameInput(request.data && request.data.input, true);
  const nowISO = new Date().toISOString();
  await db.collection(GAMES_COLLECTION).add({
    schoolName: input.schoolName,
    sport: input.sport,
    level: input.level,
    requestedCrewSize: input.requestedCrewSize,
    dateISO: input.dateISO,
    location: input.location,
    ...(input.locationCoordinates ? { locationCoordinates: input.locationCoordinates } : {}),
    payPosted: input.payPosted,
    createdByUid: profile.uid,
    createdByName: profile.displayName,
    createdByRole: profile.role,
    createdAtISO: nowISO,
    status: "open",
    mode: "marketplace",
    ...(input.acceptingBidsUntilISO ? { acceptingBidsUntilISO: input.acceptingBidsUntilISO } : {}),
    ...(input.notes ? { notes: input.notes } : {})
  });

  return { ok: true };
});

exports.createAssignedGame = onClientCall(async (request) => {
  const profile = await getRequesterProfile(request);
  assertRole(profile, ["assignor", "school"]);

  const input = validateNewGameInput(request.data && request.data.input, false);
  const directAssignmentsInput =
    request.data &&
    request.data.input &&
    Array.isArray(request.data.input.directAssignments)
      ? request.data.input.directAssignments
      : [];
  assert(directAssignmentsInput.length > 0, "invalid-argument", "At least one direct assignment is required.");

  const directAssignments = directAssignmentsInput.map(normalizeGameAssignment);
  const crewsSnapshot = await db.collection(CREWS_COLLECTION).get();
  const crewsById = new Map(
    crewsSnapshot.docs.map((doc) => {
      const crew = normalizeCrewDocument(doc.id, doc.data());
      return [crew.id, crew];
    })
  );
  const assignedOfficials = buildAssignedOfficialsFromDirectAssignments(
    { directAssignments },
    crewsById
  );
  assertNoDuplicateRosterOfficials(assignedOfficials);
  const directAssignmentConflictCheck = await checkRosterConflicts({
    game: { dateISO: input.dateISO },
    roster: assignedOfficials
  });
  assert(
    !directAssignmentConflictCheck.hasConflict,
    "failed-precondition",
    "One or more officials on this roster are already assigned to another overlapping game."
  );
  const nowISO = new Date().toISOString();
  await db.collection(GAMES_COLLECTION).add({
    schoolName: input.schoolName,
    sport: input.sport,
    level: input.level,
    requestedCrewSize: input.requestedCrewSize,
    dateISO: input.dateISO,
    location: input.location,
    ...(input.locationCoordinates ? { locationCoordinates: input.locationCoordinates } : {}),
    payPosted: input.payPosted,
    createdByUid: profile.uid,
    createdByName: profile.displayName,
    createdByRole: profile.role,
    createdAtISO: nowISO,
    status: "awarded",
    mode: "direct_assignment",
    directAssignments,
    assignedOfficials,
    ...(input.notes ? { notes: input.notes } : {})
  });

  return { ok: true };
});

exports.updateGame = onClientCall(async (request) => {
  const profile = await getRequesterProfile(request);
  assertRole(profile, ["assignor", "school"]);
  const gameId = trimString(request.data && request.data.gameId);
  assert(gameId, "invalid-argument", "gameId is required.");

  const existingGame = await getGameById(gameId);
  assert(existingGame.createdByUid === profile.uid, "permission-denied", "Only the game creator can update this game.");

  const input = validateNewGameInput(request.data && request.data.input, true);
  if (existingGame.status === "awarded") {
    const [bidsSnapshot, crewsSnapshot] = await Promise.all([
      db.collection(BIDS_COLLECTION).get(),
      db.collection(CREWS_COLLECTION).get()
    ]);
    const bidsById = new Map(
      bidsSnapshot.docs.map((doc) => {
        const bid = normalizeBidDocument(doc.id, doc.data());
        return [bid.id, bid];
      })
    );
    const crewsById = new Map(
      crewsSnapshot.docs.map((doc) => {
        const crew = normalizeCrewDocument(doc.id, doc.data());
        return [crew.id, crew];
      })
    );
    const assignedOfficials =
      existingGame.assignedOfficials?.length
        ? existingGame.assignedOfficials
        : existingGame.mode === "direct_assignment"
          ? buildAssignedOfficialsFromDirectAssignments(existingGame, crewsById)
          : buildAssignedOfficialsFromBid(
              existingGame.selectedBidId
                ? bidsById.get(existingGame.selectedBidId) ?? null
                : null,
              crewsById
            );
    if (assignedOfficials.length > 0) {
      const awardedConflictCheck = await checkRosterConflicts({
        game: { dateISO: input.dateISO },
        roster: assignedOfficials,
        ignoreGameId: gameId
      });
      assert(
        !awardedConflictCheck.hasConflict,
        "failed-precondition",
        "One or more assigned officials would conflict with another overlapping game."
      );
    }
  }
  await db.collection(GAMES_COLLECTION).doc(gameId).update({
    schoolName: input.schoolName,
    sport: input.sport,
    level: input.level,
    requestedCrewSize: input.requestedCrewSize,
    dateISO: input.dateISO,
    location: input.location,
    payPosted: input.payPosted,
    acceptingBidsUntilISO: input.acceptingBidsUntilISO || FieldValue.delete(),
    notes: input.notes || FieldValue.delete(),
    locationCoordinates: input.locationCoordinates || FieldValue.delete()
  });

  return { ok: true };
});

exports.createBid = onClientCall(async (request) => {
  const profile = await getRequesterProfile(request);
  assert(profile.role === "official", "permission-denied", "Only officials can place bids.");

  const input = request.data && request.data.input;
  assert(input && typeof input === "object", "invalid-argument", "Bid input is required.");
  const gameId = trimString(input.gameId);
  const bidderType = trimString(input.bidderType) || "individual";
  const message = trimString(input.message);
  const crewId = trimString(input.crewId);
  const baseCrewId = trimString(input.baseCrewId) || crewId;
  assert(gameId, "invalid-argument", "gameId is required.");
  assert(BIDDER_TYPES.has(bidderType), "invalid-argument", "Invalid bidder type.");
  assert(typeof input.amount === "number" && Number.isFinite(input.amount), "invalid-argument", "Bid amount must be a number.");
  assert(input.amount >= 0, "invalid-argument", "Bid amount must be zero or greater.");

  const game = await getGameById(gameId);
  assert(!isBidWindowClosed(game), "failed-precondition", "This game is no longer accepting bids.");
  assert(
    !requiresCrewBidForGame(game) || bidderType === "crew",
    "failed-precondition",
    "Varsity games require a crew bid."
  );

  let crewName;
  let proposedRoster;
  if (bidderType === "crew") {
    assert(baseCrewId, "invalid-argument", "baseCrewId is required for crew bids.");
    const crew = await getCrewById(baseCrewId);
    assert(
      canBidWithCrew(crew, profile.uid),
      "permission-denied",
      "Only the Referee for this crew can place a crew bid."
    );
    crewName = crew.name;
    proposedRoster = await normalizeProposedRoster(input.proposedRoster, crew);
    const rosterConflictCheck = await checkRosterConflicts({
      game,
      roster: proposedRoster
    });
    assert(
      !rosterConflictCheck.hasConflict,
      "failed-precondition",
      "One or more officials on this roster are already assigned to another overlapping game."
    );
  }

  await db.collection(BIDS_COLLECTION).add({
    gameId,
    officialUid: profile.uid,
    createdByOfficialId: profile.uid,
    officialName: profile.displayName,
    bidderType,
    amount: input.amount,
    createdAtISO: new Date().toISOString(),
    ...(bidderType === "crew"
      ? {
          crewId: baseCrewId,
          baseCrewId,
          crewName,
          proposedRoster
        }
      : {}),
    ...(message ? { message } : {})
  });

  return { ok: true };
});

exports.updateBid = onClientCall(async (request) => {
  const profile = await getRequesterProfile(request);
  assert(profile.role === "official", "permission-denied", "Only officials can update bids.");

  const bidId = trimString(request.data && request.data.bidId);
  const input = request.data && request.data.input;
  assert(bidId, "invalid-argument", "bidId is required.");
  assert(input && typeof input === "object", "invalid-argument", "Bid update input is required.");

  const existingBid = await getBidById(bidId);
  assert(
    await canEditExistingBid(existingBid, profile.uid),
    "permission-denied",
    existingBid.bidderType === "crew"
      ? "Only the Referee for this crew can update the crew bid."
      : "You can only update your own bids."
  );

  const game = await getGameById(existingBid.gameId);
  assert(!isBidWindowClosed(game), "failed-precondition", "This game is no longer accepting bid updates.");

  const bidderType = trimString(input.bidderType) || "individual";
  const crewId = trimString(input.crewId);
  const baseCrewId = trimString(input.baseCrewId) || crewId || existingBid.baseCrewId || existingBid.crewId;
  const message = trimString(input.message);
  assert(BIDDER_TYPES.has(bidderType), "invalid-argument", "Invalid bidder type.");
  assert(typeof input.amount === "number" && Number.isFinite(input.amount), "invalid-argument", "Bid amount must be a number.");
  assert(input.amount >= 0, "invalid-argument", "Bid amount must be zero or greater.");
  assert(
    !requiresCrewBidForGame(game) || bidderType === "crew",
    "failed-precondition",
    "Varsity games require a crew bid."
  );

  let crewName;
  let proposedRoster;
  if (bidderType === "crew") {
    assert(baseCrewId, "invalid-argument", "baseCrewId is required for crew bids.");
    const crew = await getCrewById(baseCrewId);
    assert(
      canBidWithCrew(crew, profile.uid),
      "permission-denied",
      "Only the Referee for this crew can place a crew bid."
    );
    crewName = crew.name;
    proposedRoster = await normalizeProposedRoster(input.proposedRoster, crew);
    const rosterConflictCheck = await checkRosterConflicts({
      game,
      roster: proposedRoster
    });
    assert(
      !rosterConflictCheck.hasConflict,
      "failed-precondition",
      "One or more officials on this roster are already assigned to another overlapping game."
    );
  }

  await db.collection(BIDS_COLLECTION).doc(bidId).update({
    officialName: profile.displayName,
    createdByOfficialId: profile.uid,
    amount: input.amount,
    createdAtISO: new Date().toISOString(),
    bidderType,
    crewId: bidderType === "crew" ? baseCrewId : FieldValue.delete(),
    baseCrewId: bidderType === "crew" ? baseCrewId : FieldValue.delete(),
    crewName: bidderType === "crew" ? crewName : FieldValue.delete(),
    proposedRoster: bidderType === "crew" ? proposedRoster : FieldValue.delete(),
    message: message || FieldValue.delete()
  });

  return { ok: true };
});

exports.deleteBid = onClientCall(async (request) => {
  const profile = await getRequesterProfile(request);
  assert(profile.role === "official", "permission-denied", "Only officials can delete bids.");

  const bidId = trimString(request.data && request.data.bidId);
  assert(bidId, "invalid-argument", "bidId is required.");
  const existingBid = await getBidById(bidId);
  assert(
    await canEditExistingBid(existingBid, profile.uid),
    "permission-denied",
    existingBid.bidderType === "crew"
      ? "Only the Referee for this crew can delete the crew bid."
      : "You can only delete your own bids."
  );

  await db.collection(BIDS_COLLECTION).doc(bidId).delete();
  return { ok: true };
});

exports.createCrew = onClientCall(async (request) => {
  const profile = await getRequesterProfile(request);
  assertRole(profile, ["official", "assignor", "school"]);

  const input = request.data && request.data.input;
  assert(input && typeof input === "object", "invalid-argument", "Crew input is required.");
  const name = trimString(input.name);
  assert(name, "invalid-argument", "Crew name is required.");

  const members = Array.isArray(input.members) ? input.members.map(normalizeCrewMember) : [];
  const uniqueMembers = Array.from(new Map(members.map((member) => [member.uid, member])).values());
  assert(uniqueMembers.length >= 1 && uniqueMembers.length <= 15, "invalid-argument", "Crew must include between 1 and 15 members.");

  const memberUids = uniqueMembers.map((member) => member.uid);
  const memberPositions = normalizeCrewMemberPositions(input.memberPositions, memberUids);
  assertSingleCrewReferee(memberPositions);
  const refereeOfficialId = getRefereeOfficialIdFromMemberPositions(memberPositions);
  await db.collection(CREWS_COLLECTION).add({
    name,
    createdByUid: profile.uid,
    createdByName: profile.displayName,
    createdByRole: profile.role,
    createdAtISO: new Date().toISOString(),
    crewChiefUid: profile.uid,
    crewChiefName: profile.displayName,
    memberUids,
    members: uniqueMembers,
    memberPositions,
    ...(refereeOfficialId ? { refereeOfficialId } : {})
  });

  return { ok: true };
});

exports.deleteCrew = onClientCall(async (request) => {
  const profile = await getRequesterProfile(request);
  const crewId = trimString(request.data && request.data.crewId);
  assert(crewId, "invalid-argument", "crewId is required.");
  const crew = await getCrewById(crewId);
  assert(crew.createdByUid === profile.uid, "permission-denied", "Only the crew creator can delete this crew.");

  await db.collection(CREWS_COLLECTION).doc(crewId).delete();
  return { ok: true };
});

exports.updateCrewMembers = onClientCall(async (request) => {
  const profile = await getRequesterProfile(request);
  const crewId = trimString(request.data && request.data.crewId);
  assert(crewId, "invalid-argument", "crewId is required.");
  const crew = await getCrewById(crewId);
  assert(canManageCrew(crew, profile.uid), "permission-denied", "Only the crew creator or chief can update crew members.");

  const members = Array.isArray(request.data && request.data.members)
    ? request.data.members.map(normalizeCrewMember)
    : [];
  const uniqueMembers = Array.from(new Map(members.map((member) => [member.uid, member])).values());
  assert(uniqueMembers.length >= 1 && uniqueMembers.length <= 15, "invalid-argument", "Crew must include between 1 and 15 members.");
  const memberUids = uniqueMembers.map((member) => member.uid);
  const memberPositions = normalizeCrewMemberPositions(crew.memberPositions, memberUids);
  assertSingleCrewReferee(memberPositions);
  const refereeOfficialId = getRefereeOfficialIdFromMemberPositions(memberPositions);

  await db.collection(CREWS_COLLECTION).doc(crewId).update({
    memberUids,
    members: uniqueMembers,
    memberPositions,
    refereeOfficialId: refereeOfficialId || FieldValue.delete()
  });
  return { ok: true };
});

exports.updateCrewChief = onClientCall(async (request) => {
  const profile = await getRequesterProfile(request);
  const crewId = trimString(request.data && request.data.crewId);
  const chief = request.data && request.data.chief;
  assert(crewId, "invalid-argument", "crewId is required.");
  assert(chief && typeof chief === "object", "invalid-argument", "chief is required.");

  const crew = await getCrewById(crewId);
  assert(canManageCrew(crew, profile.uid), "permission-denied", "Only the crew creator or chief can update the crew chief.");

  const chiefUid = trimString(chief.uid);
  const chiefName = trimString(chief.name) || "Crew Chief";
  assert(chiefUid, "invalid-argument", "Crew chief uid is required.");
  const allowedChiefUids = new Set([crew.createdByUid, ...crew.memberUids]);
  assert(allowedChiefUids.has(chiefUid), "invalid-argument", "Crew chief must belong to the crew.");

  await db.collection(CREWS_COLLECTION).doc(crewId).update({
    crewChiefUid: chiefUid,
    crewChiefName: chiefName
  });
  return { ok: true };
});

exports.updateCrewMemberPositions = onClientCall(async (request) => {
  const profile = await getRequesterProfile(request);
  const crewId = trimString(request.data && request.data.crewId);
  assert(crewId, "invalid-argument", "crewId is required.");
  const crew = await getCrewById(crewId);
  assert(canManageCrew(crew, profile.uid), "permission-denied", "Only the crew creator or chief can update member positions.");

  const memberPositions = normalizeCrewMemberPositions(
    request.data && request.data.memberPositions,
    crew.memberUids
  );
  assertSingleCrewReferee(memberPositions);
  const refereeOfficialId = getRefereeOfficialIdFromMemberPositions(memberPositions);
  await db.collection(CREWS_COLLECTION).doc(crewId).update({
    memberPositions,
    refereeOfficialId: refereeOfficialId || FieldValue.delete()
  });
  return { ok: true };
});

exports.upsertGameRating = onClientCall(async (request) => {
  const profile = await getRequesterProfile(request);
  assert(profile.role !== "evaluator", "permission-denied", "Evaluators cannot submit game ratings.");

  const input = request.data && request.data.input;
  assert(input && typeof input === "object", "invalid-argument", "Rating input is required.");
  assert(RATING_TARGET_TYPES.has(trimString(input.targetType)), "invalid-argument", "Invalid rating target type.");
  assert(trimString(input.gameId), "invalid-argument", "gameId is required.");
  assert(trimString(input.targetId), "invalid-argument", "targetId is required.");
  assert(Number.isInteger(input.stars) && input.stars >= 1 && input.stars <= 5, "invalid-argument", "Rating must be an integer between 1 and 5.");

  const nowISO = new Date().toISOString();
  const ratingId = `${trimString(input.gameId)}__${profile.uid}__${trimString(input.targetType)}__${trimString(input.targetId)}`;
  await db.collection(RATINGS_COLLECTION).doc(ratingId).set(
    {
      gameId: trimString(input.gameId),
      targetType: trimString(input.targetType),
      targetId: trimString(input.targetId),
      ratedByUid: profile.uid,
      ratedByRole: profile.role,
      stars: input.stars,
      updatedAtISO: nowISO,
      createdAtISO: nowISO,
      comment: trimString(input.comment) || FieldValue.delete()
    },
    { merge: true }
  );
  return { ok: true };
});

exports.upsertGameEvaluation = onClientCall(async (request) => {
  const profile = await getRequesterProfile(request);
  assert(profile.role === "evaluator", "permission-denied", "Only evaluators can submit game evaluations.");

  const input = request.data && request.data.input;
  assert(input && typeof input === "object", "invalid-argument", "Evaluation input is required.");
  assert(trimString(input.gameId), "invalid-argument", "gameId is required.");
  assert(Number.isInteger(input.overallScore) && input.overallScore >= 1 && input.overallScore <= 5, "invalid-argument", "Overall score must be an integer between 1 and 5.");

  const nowISO = new Date().toISOString();
  const evaluationId = `${trimString(input.gameId)}__${profile.uid}`;
  await db.collection(EVALUATIONS_COLLECTION).doc(evaluationId).set(
    {
      gameId: trimString(input.gameId),
      evaluatorUid: profile.uid,
      overallScore: input.overallScore,
      updatedAtISO: nowISO,
      createdAtISO: nowISO,
      notes: trimString(input.notes) || FieldValue.delete()
    },
    { merge: true }
  );
  return { ok: true };
});

exports.selectBid = onClientCall(async (request) => {
  const profile = await getRequesterProfile(request);
  assertRole(profile, ["assignor", "school"]);

  const gameId = trimString(request.data && request.data.gameId);
  const bidId = trimString(request.data && request.data.bidId);
  assert(gameId, "invalid-argument", "gameId is required.");
  assert(bidId, "invalid-argument", "bidId is required.");

  const game = await getGameById(gameId);
  assert(game.createdByUid === profile.uid, "permission-denied", "Only the game creator can award a bid.");
  const bid = await getBidById(bidId);
  assert(bid.gameId === gameId, "invalid-argument", "The selected bid does not belong to this game.");
  const crewsSnapshot = await db.collection(CREWS_COLLECTION).get();
  const crewsById = new Map(
    crewsSnapshot.docs.map((doc) => {
      const crew = normalizeCrewDocument(doc.id, doc.data());
      return [crew.id, crew];
    })
  );
  const assignedOfficials = buildAssignedOfficialsFromBid(bid, crewsById);
  assert(assignedOfficials.length > 0, "failed-precondition", "The selected bid does not include a valid roster.");
  assertNoDuplicateRosterOfficials(assignedOfficials);
  const rosterConflictCheck = await checkRosterConflicts({
    game,
    roster: assignedOfficials,
    ignoreGameId: gameId
  });
  assert(
    !rosterConflictCheck.hasConflict,
    "failed-precondition",
    "One or more officials on this roster are already assigned to another overlapping game."
  );

  await db.collection(GAMES_COLLECTION).doc(gameId).update({
    selectedBidId: bidId,
    status: "awarded",
    awardedCrewId: bid.bidderType === "crew" ? bid.baseCrewId || bid.crewId : FieldValue.delete(),
    assignedOfficials
  });
  return { ok: true };
});

exports.deleteGame = onClientCall(async (request) => {
  const profile = await getRequesterProfile(request);
  assertRole(profile, ["assignor", "school"]);

  const gameId = trimString(request.data && request.data.gameId);
  assert(gameId, "invalid-argument", "gameId is required.");
  const game = await getGameById(gameId);
  assert(game.createdByUid === profile.uid, "permission-denied", "Only the game creator can delete this game.");

  const bidsSnapshot = await db.collection(BIDS_COLLECTION).where("gameId", "==", gameId).get();
  if (!bidsSnapshot.empty) {
    await Promise.all(bidsSnapshot.docs.map((doc) => doc.ref.delete()));
  }
  await db.collection(GAMES_COLLECTION).doc(gameId).delete();
  return { ok: true };
});

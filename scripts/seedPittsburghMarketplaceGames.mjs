#!/usr/bin/env node

import process from "node:process";

const FIREBASE_API_KEY =
  process.env.VITE_FIREBASE_API_KEY ?? "AIzaSyALIsBJGp-VuumUIhZTgs8gzQVsMZZUgEw";
const FIREBASE_PROJECT_ID =
  process.env.VITE_FIREBASE_PROJECT_ID ?? "officiating-marketplace-487319";

const configuredDatabaseIdRaw = (
  process.env.VITE_FIRESTORE_DATABASE_ID ??
  process.env.FIRESTORE_DATABASE_ID ??
  "(default)"
).trim();
const configuredDatabaseId = configuredDatabaseIdRaw || "(default)";
const FIRESTORE_DATABASE_IDS_TO_TRY = (() => {
  if (configuredDatabaseId === "(default)") {
    return ["(default)", "default"];
  }
  if (configuredDatabaseId === "default") {
    return ["default", "(default)"];
  }
  return [configuredDatabaseId];
})();
let activeFirestoreDatabaseId = FIRESTORE_DATABASE_IDS_TO_TRY[0];

const IDENTITY_BASE_URL = "https://identitytoolkit.googleapis.com/v1";
function getFirestoreBaseUrl(databaseId) {
  return `https://firestore.googleapis.com/v1/projects/${FIREBASE_PROJECT_ID}/databases/${databaseId}/documents`;
}

const THREE_WEEKS_MS = 21 * 24 * 60 * 60 * 1000;
const SCHOOL_ACCOUNT_EMAILS = [
  "mr.ad1@gmail.com",
  "mr.ad2@gmail.com",
  "mr.ad3@gmail.com"
];

const SCHOOL_LOCATIONS = [
  {
    schoolName: "Blackhawk High School",
    location: "500 Blackhawk Rd, Beaver Falls, PA 15010",
    locationCoordinates: { lat: 40.7689, lng: -80.3427 },
    approxMilesFromDowntownPittsburgh: 33
  },
  {
    schoolName: "Kiski Area High School",
    location: "240 Hyde Park Rd, Vandergrift, PA 15690",
    locationCoordinates: { lat: 40.6005, lng: -79.5714 },
    approxMilesFromDowntownPittsburgh: 27
  },
  {
    schoolName: "Ringgold High School",
    location: "1 Ram Dr, Monongahela, PA 15063",
    locationCoordinates: { lat: 40.1919, lng: -79.9227 },
    approxMilesFromDowntownPittsburgh: 24
  }
];

const FALL_FRIDAYS = [
  "2026-09-04",
  "2026-09-18",
  "2026-10-02",
  "2026-10-16",
  "2026-10-30"
];
const VARSITY_PRICES_BY_SCHOOL = [
  [95, 98, 102, 106, 110],
  [92, 96, 100, 104, 108],
  [90, 94, 99, 103, 107]
];

function parseSchoolCredentials() {
  const rawAccounts = process.env.SEED_SCHOOL_ACCOUNTS;
  const rawPasswords = process.env.SEED_SCHOOL_PASSWORDS;

  if (!rawAccounts && !rawPasswords) {
    throw new Error(
      "Missing credentials. Set either:\n" +
        "1) SEED_SCHOOL_PASSWORDS as JSON array (or comma list) with 3 passwords in mr.ad1/2/3 order, or\n" +
        "2) SEED_SCHOOL_ACCOUNTS as JSON array with 3 entries containing password (email optional)."
    );
  }

  if (rawAccounts) {
    let parsed;
    try {
      parsed = JSON.parse(rawAccounts);
    } catch (error) {
      throw new Error(
        `SEED_SCHOOL_ACCOUNTS must be valid JSON. Parse error: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }

    if (!Array.isArray(parsed) || parsed.length !== 3) {
      throw new Error("SEED_SCHOOL_ACCOUNTS must contain exactly 3 entries.");
    }

    return parsed.map((entry, index) => {
      if (!entry || typeof entry !== "object" || typeof entry.password !== "string") {
        throw new Error(
          `Invalid SEED_SCHOOL_ACCOUNTS entry at index ${index}. Each entry needs a password.`
        );
      }

      const fixedEmail = SCHOOL_ACCOUNT_EMAILS[index];
      const suppliedEmail =
        typeof entry.email === "string" ? entry.email.trim().toLowerCase() : "";

      if (suppliedEmail && suppliedEmail !== fixedEmail) {
        throw new Error(
          `Entry ${index} email must be ${fixedEmail} (received ${suppliedEmail}).`
        );
      }

      return { email: fixedEmail, password: entry.password };
    });
  }

  const passwordList = (() => {
    if (!rawPasswords) {
      return [];
    }

    try {
      const parsed = JSON.parse(rawPasswords);
      if (Array.isArray(parsed)) {
        return parsed.map((value) => String(value));
      }
    } catch {
      // Fallback to comma-separated list.
    }

    return rawPasswords.split(",").map((value) => value.trim());
  })();

  if (passwordList.length !== 3 || passwordList.some((password) => !password)) {
    throw new Error(
      "SEED_SCHOOL_PASSWORDS must provide exactly 3 non-empty passwords in mr.ad1/2/3 order."
    );
  }

  return SCHOOL_ACCOUNT_EMAILS.map((email, index) => ({
    email,
    password: passwordList[index]
  }));
}

function addDays(yyyyMmDd, daysToAdd) {
  const [year, month, day] = yyyyMmDd.split("-").map((value) => Number(value));
  const date = new Date(Date.UTC(year, month - 1, day));
  date.setUTCDate(date.getUTCDate() + daysToAdd);
  const nextYear = date.getUTCFullYear();
  const nextMonth = String(date.getUTCMonth() + 1).padStart(2, "0");
  const nextDay = String(date.getUTCDate()).padStart(2, "0");
  return `${nextYear}-${nextMonth}-${nextDay}`;
}

function localEasternToIso(datePart, timePart) {
  const localTimestamp = `${datePart}T${timePart}:00-04:00`;
  return new Date(localTimestamp).toISOString();
}

function buildScheduleForSchool(index) {
  return FALL_FRIDAYS.map((friday, fridayIndex) => ({
    slot: `varsity_friday_week_${fridayIndex + 1}`,
    sport: "Football",
    level: "Varsity",
    requestedCrewSize: 5,
    payPosted: VARSITY_PRICES_BY_SCHOOL[index][fridayIndex],
    dateISO: localEasternToIso(friday, "19:00"),
    notes: `Friday night varsity football game for week ${fridayIndex + 1} of the fall 2026 slate.`
  }));
}

function slugify(value) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
}

function toFirestoreValue(value) {
  if (value === null) {
    return { nullValue: null };
  }
  if (typeof value === "string") {
    return { stringValue: value };
  }
  if (typeof value === "boolean") {
    return { booleanValue: value };
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new Error(`Cannot encode non-finite number: ${value}`);
    }
    return Number.isInteger(value)
      ? { integerValue: String(value) }
      : { doubleValue: value };
  }
  if (Array.isArray(value)) {
    return { arrayValue: { values: value.map((entry) => toFirestoreValue(entry)) } };
  }
  if (typeof value === "object") {
    return { mapValue: { fields: toFirestoreFields(value) } };
  }
  throw new Error(`Unsupported Firestore value type: ${typeof value}`);
}

function toFirestoreFields(obj) {
  return Object.entries(obj).reduce((fields, [key, value]) => {
    if (value !== undefined) {
      fields[key] = toFirestoreValue(value);
    }
    return fields;
  }, {});
}

function getStringField(document, fieldName) {
  const value = document?.fields?.[fieldName];
  if (value && typeof value.stringValue === "string") {
    return value.stringValue;
  }
  return "";
}

async function requestJson(url, options = {}) {
  const response = await fetch(url, options);
  const responseText = await response.text();
  let data = null;

  if (responseText) {
    try {
      data = JSON.parse(responseText);
    } catch {
      data = { raw: responseText };
    }
  }

  if (!response.ok) {
    const errorMessage =
      data && typeof data === "object" && data.error && data.error.message
        ? data.error.message
        : `${response.status} ${response.statusText}`;
    throw new Error(`Request failed (${url}): ${errorMessage}`);
  }

  return data;
}

async function signInWithPassword(email, password) {
  const url = `${IDENTITY_BASE_URL}/accounts:signInWithPassword?key=${FIREBASE_API_KEY}`;
  return requestJson(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email,
      password,
      returnSecureToken: true
    })
  });
}

async function getUserProfileDocument(uid, idToken) {
  return withFirestoreDatabaseFallback((databaseId) => {
    const url = `${getFirestoreBaseUrl(databaseId)}/userProfiles/${uid}`;
    return requestJson(url, {
      method: "GET",
      headers: { Authorization: `Bearer ${idToken}` }
    });
  });
}

async function upsertGameDocument(gameId, payload, idToken) {
  return withFirestoreDatabaseFallback((databaseId) => {
    const url = `${getFirestoreBaseUrl(databaseId)}/games/${gameId}`;
    return requestJson(url, {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${idToken}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        fields: toFirestoreFields(payload)
      })
    });
  });
}

function isMissingDatabaseError(error) {
  const message = error instanceof Error ? error.message : String(error ?? "");
  return (
    message.includes("does not exist") ||
    (message.includes("Database") && message.includes("not found"))
  );
}

async function withFirestoreDatabaseFallback(operation) {
  let lastError = null;
  for (const databaseId of FIRESTORE_DATABASE_IDS_TO_TRY) {
    try {
      const result = await operation(databaseId);
      activeFirestoreDatabaseId = databaseId;
      return result;
    } catch (error) {
      lastError = error;
      if (!isMissingDatabaseError(error)) {
        throw error;
      }
    }
  }

  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

async function seedSchoolGames(credential, schoolMeta, schedule, index) {
  const authPayload = await signInWithPassword(credential.email, credential.password);
  const uid = authPayload.localId;
  const idToken = authPayload.idToken;
  const profileDocument = await getUserProfileDocument(uid, idToken);
  const role = getStringField(profileDocument, "role");
  const displayName =
    getStringField(profileDocument, "displayName") || credential.email.split("@")[0];

  if (role !== "school") {
    throw new Error(`Account ${credential.email} is role=${role || "unknown"}, expected school.`);
  }

  const createdGames = [];
  for (const gameTemplate of schedule) {
    const biddingCloseISO = new Date(
      new Date(gameTemplate.dateISO).getTime() - THREE_WEEKS_MS
    ).toISOString();
    const dateKey = gameTemplate.dateISO.slice(0, 10).replace(/-/g, "");
    const gameId = `seed_pgh_${uid.slice(0, 8)}_${slugify(gameTemplate.slot)}_${dateKey}`;

    const payload = {
      schoolName: schoolMeta.schoolName,
      sport: gameTemplate.sport,
      level: gameTemplate.level,
      requestedCrewSize: gameTemplate.requestedCrewSize,
      dateISO: gameTemplate.dateISO,
      scheduledDateKey: gameTemplate.dateISO.slice(0, 10),
      acceptingBidsUntilISO: biddingCloseISO,
      location: schoolMeta.location,
      locationCoordinates: schoolMeta.locationCoordinates,
      payPosted: gameTemplate.payPosted,
      notes:
        `${gameTemplate.notes} Seeded marketplace game within ~${schoolMeta.approxMilesFromDowntownPittsburgh} miles of downtown Pittsburgh.`,
      createdByUid: uid,
      createdByName: displayName,
      createdByRole: "school",
      createdAtISO: new Date().toISOString(),
      status: "open",
      mode: "marketplace"
    };

    await upsertGameDocument(gameId, payload, idToken);
    createdGames.push({
      gameId,
      level: gameTemplate.level,
      sport: gameTemplate.sport,
      dateISO: gameTemplate.dateISO,
      payPosted: gameTemplate.payPosted
    });
  }

  console.info(
    `[${index + 1}/3] ${credential.email} -> ${schoolMeta.schoolName}: ${createdGames.length} games upserted`
  );
  createdGames.forEach((game) => {
    console.info(
      `  - ${game.level} ${game.sport} | ${game.dateISO} | $${game.payPosted} | ${game.gameId}`
    );
  });
}

async function main() {
  const credentials = parseSchoolCredentials();

  console.info(
    `Seeding 15 marketplace games in Firestore database "${configuredDatabaseId}" for project "${FIREBASE_PROJECT_ID}".`
  );
  console.info(`School accounts: ${SCHOOL_ACCOUNT_EMAILS.join(", ")}`);
  console.info("Constraints enforced:");
  console.info("  - 3 school accounts x 5 games each");
  console.info("  - 15 total marketplace games");
  console.info("  - All games are Varsity Football");
  console.info("  - Every game is scheduled on a different fall 2026 Friday night slot set");
  console.info("  - Requested crew size is 5 officials");
  console.info("  - Friday 7:00 PM local starts with varied varsity fees by school/week");
  console.info("  - Bidding closes exactly 3 weeks before each game");

  for (let index = 0; index < credentials.length; index += 1) {
    const credential = credentials[index];
    const schoolMeta = SCHOOL_LOCATIONS[index];
    const schedule = buildScheduleForSchool(index);
    await seedSchoolGames(credential, schoolMeta, schedule, index);
  }

  console.info(`Active Firestore database ID: ${activeFirestoreDatabaseId}`);
  console.info("Done.");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});

import test from "node:test";
import assert from "node:assert/strict";

import {
  buildBidSubmission,
  findActiveBid,
  getBidEligibleCrews,
  getBidCrewId,
  getCrewMemberCrews,
  getCrewRefereeOfficialId,
  getBidFormDefaults,
  isBidEditableByOfficial,
  requiresCrewBidForGame
} from "../../src/lib/bids";
import {
  findDuplicateRosterOfficialIds,
  gamesOverlap,
  getAvailableFootballPositionsForRoster,
  getCrewDefaultRoster
} from "../../src/lib/crewRosters";
import type { Bid, Crew } from "../../src/types";

const crews: Crew[] = [
  {
    id: "crew-1",
    name: "Metro Crew",
    createdByUid: "o1",
    createdByName: "Alex Zebra",
    createdByRole: "official",
    createdAtISO: "2026-03-01T00:00:00.000Z",
    crewChiefUid: "o1",
    crewChiefName: "Alex Zebra",
    refereeOfficialId: "o1",
    memberUids: ["o1"],
    members: [{ uid: "o1", name: "Alex Zebra", email: "alex@example.com" }],
    memberPositions: { o1: "R" }
  },
  {
    id: "crew-2",
    name: "River Crew",
    createdByUid: "o2",
    createdByName: "Sam Blue",
    createdByRole: "official",
    createdAtISO: "2026-03-01T00:00:00.000Z",
    crewChiefUid: "o2",
    crewChiefName: "Sam Blue",
    memberUids: ["o2", "o3"],
    members: [
      { uid: "o2", name: "Sam Blue", email: "sam@example.com" },
      { uid: "o3", name: "Jamie Red", email: "jamie@example.com" }
    ],
    memberPositions: { o2: "R" }
  }
];

const existingBids: Bid[] = [
  {
    id: "bid-1",
    gameId: "game-1",
    officialUid: "o1",
    officialName: "Alex Zebra",
    bidderType: "individual",
    amount: 110,
    createdAtISO: "2026-03-10T10:00:00.000Z"
  },
  {
    id: "bid-2",
    gameId: "game-1",
    officialUid: "o1",
    officialName: "Alex Zebra",
    bidderType: "crew",
    crewId: "crew-1",
    crewName: "Metro Crew",
    amount: 140,
    createdAtISO: "2026-03-11T10:00:00.000Z"
  },
  {
    id: "bid-3",
    gameId: "game-1",
    officialUid: "o9",
    officialName: "Legacy Referee",
    bidderType: "crew",
    crewId: "crew-2",
    baseCrewId: "crew-2",
    crewName: "River Crew",
    amount: 145,
    createdAtISO: "2026-03-12T10:00:00.000Z"
  }
];

test("findActiveBid selects the current individual, crew, or latest bid", () => {
  assert.equal(
    findActiveBid({
      bidderType: "individual",
      existingBids,
      selectedCrewId: "",
      singleBidMode: false
    })?.id,
    "bid-1"
  );

  assert.equal(
    findActiveBid({
      bidderType: "crew",
      existingBids,
      selectedCrewId: "crew-2",
      singleBidMode: false
    })?.id,
    "bid-3"
  );

  assert.equal(
    findActiveBid({
      bidderType: "individual",
      existingBids,
      selectedCrewId: "",
      singleBidMode: true
    })?.id,
    "bid-3"
  );
});

test("getBidFormDefaults bumps the current offer when a bid already exists", () => {
  assert.deepEqual(getBidFormDefaults(100, existingBids[0]), {
    amount: "111",
    message: ""
  });
  assert.deepEqual(getBidFormDefaults(100, null), {
    amount: "100",
    message: ""
  });
});

test("buildBidSubmission trims values and resolves crew metadata", () => {
  const proposedRoster = getCrewDefaultRoster(crews[0]);
  const result = buildBidSubmission({
    officialName: " Alex Zebra ",
    bidderType: "crew",
    selectedCrewId: "crew-1",
    amount: "150",
    message: " Ready to travel ",
    activeBid: existingBids[1],
    availableCrews: crews,
    proposedRoster
  });

  assert.deepEqual(result, {
    officialName: "Alex Zebra",
    bidderType: "crew",
    crewId: "crew-1",
    baseCrewId: "crew-1",
    crewName: "Metro Crew",
    proposedRoster,
    amount: 150,
    message: "Ready to travel"
  });
});

test("buildBidSubmission rejects lower offers, invalid messages, and varsity individual bids", () => {
  assert.throws(
    () =>
      buildBidSubmission({
        officialName: "Alex Zebra",
        bidderType: "individual",
        selectedCrewId: "",
        amount: "110",
        message: "",
        activeBid: existingBids[0],
        availableCrews: crews
      }),
    /New offer must be higher than your current bid/
  );

  assert.throws(
    () =>
      buildBidSubmission({
        officialName: "Alex Zebra",
        bidderType: "individual",
        selectedCrewId: "",
        amount: "120",
        message: "x".repeat(201),
        activeBid: null,
        availableCrews: crews
      }),
    /Message cannot exceed 200 characters/
  );

  assert.throws(
    () =>
      buildBidSubmission({
        officialName: "Alex Zebra",
        bidderType: "individual",
        selectedCrewId: "",
        amount: "120",
        message: "",
        activeBid: null,
        availableCrews: crews,
        requiresCrewBid: true
      }),
    /Varsity games require crew bids/
  );
});

test("crew bidding helpers identify varsity games, members, and referee-eligible crews", () => {
  assert.equal(
    requiresCrewBidForGame({
      level: "Varsity"
    }),
    true
  );
  assert.equal(
    requiresCrewBidForGame({
      level: "Junior Varsity"
    }),
    false
  );

  assert.equal(getCrewRefereeOfficialId(crews[0]), "o1");
  assert.equal(getCrewRefereeOfficialId(crews[1]), "o2");

  assert.deepEqual(
    getCrewMemberCrews(crews, "o3").map((crew) => crew.id),
    ["crew-2"]
  );
  assert.deepEqual(
    getBidEligibleCrews(crews, "o3").map((crew) => crew.id),
    []
  );
  assert.deepEqual(
    getBidEligibleCrews(crews, "o2").map((crew) => crew.id),
    ["crew-2"]
  );
  assert.deepEqual(getBidEligibleCrews(crews, "o9"), []);
});

test("crew bid helpers resolve crew identity and editable bids for current referees", () => {
  assert.equal(getBidCrewId(existingBids[2]), "crew-2");
  assert.equal(
    isBidEditableByOfficial(existingBids[2], "o2", ["crew-2"]),
    true
  );
  assert.equal(
    isBidEditableByOfficial(existingBids[2], "o3", ["crew-2"]),
    true
  );
  assert.equal(
    isBidEditableByOfficial(existingBids[2], "o3", []),
    false
  );
  assert.equal(
    isBidEditableByOfficial(existingBids[0], "o1", []),
    true
  );
});

test("crew roster helpers initialize base rosters, catch duplicates, and detect overlap windows", () => {
  const defaultRoster = getCrewDefaultRoster(crews[1]);
  assert.deepEqual(
    defaultRoster.map((official) => official.officialUid),
    ["o2", "o3"]
  );

  assert.deepEqual(
    findDuplicateRosterOfficialIds([
      defaultRoster[0],
      defaultRoster[0]
    ]),
    ["o2"]
  );

  assert.equal(
    gamesOverlap(
      { dateISO: "2026-03-20T18:00:00.000Z" },
      { dateISO: "2026-03-20T19:30:00.000Z" }
    ),
    true
  );
  assert.equal(
    gamesOverlap(
      { dateISO: "2026-03-20T18:00:00.000Z" },
      { dateISO: "2026-03-21T00:30:00.000Z" }
    ),
    false
  );

  const rosterWithAssignedPositions = [
    {
      officialUid: "o2",
      officialName: "Sam Blue",
      role: "R" as const,
      source: "baseCrew" as const,
      baseCrewMember: true
    },
    {
      officialUid: "o3",
      officialName: "Jamie Red",
      role: "U" as const,
      source: "baseCrew" as const,
      baseCrewMember: true
    },
    {
      officialUid: "o4",
      officialName: "Taylor Alt",
      source: "alternate" as const,
      baseCrewMember: false
    }
  ];

  assert.equal(
    getAvailableFootballPositionsForRoster(rosterWithAssignedPositions, "o4").includes("R"),
    false
  );
  assert.equal(
    getAvailableFootballPositionsForRoster(rosterWithAssignedPositions, "o4").includes("U"),
    false
  );
  assert.equal(
    getAvailableFootballPositionsForRoster(rosterWithAssignedPositions, "o4").includes("C"),
    true
  );
  assert.equal(
    getAvailableFootballPositionsForRoster(rosterWithAssignedPositions, "o2").includes("R"),
    true
  );
});

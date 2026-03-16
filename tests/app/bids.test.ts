import test from "node:test";
import assert from "node:assert/strict";

import {
  buildBidSubmission,
  findActiveBid,
  getBidEligibleCrews,
  getBidFormDefaults,
  requiresCrewBidForGame
} from "../../src/lib/bids";
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
    memberUids: ["o1"],
    members: [{ uid: "o1", name: "Alex Zebra", email: "alex@example.com" }],
    memberPositions: {}
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
    memberPositions: {}
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
      selectedCrewId: "crew-1",
      singleBidMode: false
    })?.id,
    "bid-2"
  );

  assert.equal(
    findActiveBid({
      bidderType: "individual",
      existingBids,
      selectedCrewId: "",
      singleBidMode: true
    })?.id,
    "bid-2"
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
  const result = buildBidSubmission({
    officialName: " Alex Zebra ",
    bidderType: "crew",
    selectedCrewId: "crew-1",
    amount: "150",
    message: " Ready to travel ",
    activeBid: existingBids[1],
    availableCrews: crews
  });

  assert.deepEqual(result, {
    officialName: "Alex Zebra",
    bidderType: "crew",
    crewId: "crew-1",
    crewName: "Metro Crew",
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

test("crew bidding helpers identify varsity games and eligible crews", () => {
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

  assert.deepEqual(
    getBidEligibleCrews(crews, "o3").map((crew) => crew.id),
    ["crew-2"]
  );
  assert.deepEqual(getBidEligibleCrews(crews, "o9"), []);
});

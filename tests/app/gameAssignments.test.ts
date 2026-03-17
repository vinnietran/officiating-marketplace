import test from "node:test";
import assert from "node:assert/strict";

import {
  getBidderName,
  getDirectAssignmentLabel,
  getOfficialAssignmentDetails,
  isOfficialAssignedToAwardedMarketplaceGame,
  isOfficialAssignedToDirectGame,
  toPositionLabel
} from "../../src/lib/gameAssignments";
import type { Bid, Crew, Game } from "../../src/types";

const crew: Crew = {
  id: "crew-1",
  name: "Metro Crew",
  createdByUid: "o1",
  createdByName: "Alex Zebra",
  createdByRole: "official",
  createdAtISO: "2026-03-01T00:00:00.000Z",
  crewChiefUid: "o1",
  crewChiefName: "Alex Zebra",
  refereeOfficialId: "o1",
  memberUids: ["o1", "o2"],
  members: [
    { uid: "o1", name: "Alex Zebra", email: "alex@example.com" },
    { uid: "o2", name: "Jamie Stripe", email: "jamie@example.com" }
  ],
  memberPositions: { o1: "R", o2: "U" }
};

const directGame: Game = {
  id: "game-1",
  schoolName: "Central High",
  sport: "Football",
  level: "Varsity",
  dateISO: "2026-03-20T18:00:00.000Z",
  location: "Stadium",
  payPosted: 250,
  createdByUid: "a1",
  createdByRole: "assignor",
  createdAtISO: "2026-03-01T00:00:00.000Z",
  status: "awarded",
  mode: "direct_assignment",
  directAssignments: [
    {
      assignmentType: "crew",
      crewId: "crew-1",
      crewName: "Metro Crew",
      memberUids: ["o1", "o2"],
      memberNames: ["Alex Zebra", "Jamie Stripe"]
    }
  ]
};

const marketplaceGame: Game = {
  ...directGame,
  mode: "marketplace",
  directAssignments: undefined,
  selectedBidId: "bid-1",
  awardedCrewId: "crew-1",
  assignedOfficials: [
    {
      officialUid: "o1",
      officialName: "Alex Zebra",
      role: "R",
      source: "baseCrew",
      baseCrewMember: true
    },
    {
      officialUid: "o9",
      officialName: "Taylor Alternate",
      role: "U",
      source: "alternate",
      baseCrewMember: false
    }
  ]
};

const selectedBid: Bid = {
  id: "bid-1",
  gameId: "game-1",
  officialUid: "o1",
  officialName: "Alex Zebra",
  bidderType: "crew",
  crewId: "crew-1",
  baseCrewId: "crew-1",
  crewName: "Metro Crew",
  proposedRoster: [
    {
      officialUid: "o1",
      officialName: "Alex Zebra",
      role: "R",
      source: "baseCrew",
      baseCrewMember: true
    },
    {
      officialUid: "o9",
      officialName: "Taylor Alternate",
      role: "U",
      source: "alternate",
      baseCrewMember: false
    }
  ],
  amount: 140,
  createdAtISO: "2026-03-10T00:00:00.000Z"
};

test("assignment helpers identify direct and awarded marketplace assignments", () => {
  const crewsById = new Map([[crew.id, crew]]);
  assert.equal(isOfficialAssignedToDirectGame(directGame, "o2"), true);
  assert.equal(
    isOfficialAssignedToAwardedMarketplaceGame(selectedBid, crewsById, "o9"),
    true
  );
  assert.equal(
    isOfficialAssignedToAwardedMarketplaceGame(selectedBid, crewsById, "other"),
    false
  );
});

test("display helpers render bidder, assignment, and position labels", () => {
  assert.equal(getBidderName(selectedBid), "Metro Crew (Crew)");
  assert.equal(getDirectAssignmentLabel(directGame), "Metro Crew (Crew)");
  assert.equal(toPositionLabel("R"), "Referee (R)");
  assert.equal(toPositionLabel(), "Unassigned");
});

test("getOfficialAssignmentDetails resolves crew and position information", () => {
  const crewsById = new Map([[crew.id, crew]]);
  assert.deepEqual(
    getOfficialAssignmentDetails(directGame, null, crewsById, "o2"),
    {
      crewLabel: "Metro Crew",
      positionLabel: "Umpire (U)"
    }
  );

  assert.deepEqual(
    getOfficialAssignmentDetails(marketplaceGame, selectedBid, crewsById, "o9"),
    {
      crewLabel: "Metro Crew",
      positionLabel: "Umpire (U)"
    }
  );
});

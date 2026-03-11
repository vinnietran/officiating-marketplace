import test from "node:test";
import assert from "node:assert/strict";

import {
  buildQualifiedGameLevels,
  filterAvailableMarketplaceGames,
  getLocationClosenessScore,
  normalizeForMatch,
  tokenizeForMatch
} from "../../src/lib/marketplace";
import type { Game } from "../../src/types";

const openGame: Game = {
  id: "game-open",
  schoolName: "Central High",
  sport: "Football",
  level: "Varsity",
  dateISO: "2026-03-20T18:00:00.000Z",
  acceptingBidsUntilISO: "2026-03-19T18:00:00.000Z",
  location: "123 Main St, Pittsburgh, PA 15222",
  payPosted: 250,
  createdByUid: "a1",
  createdByRole: "assignor",
  createdAtISO: "2026-03-01T00:00:00.000Z",
  status: "open",
  mode: "marketplace"
};

test("text normalization and tokenization support marketplace search matching", () => {
  assert.equal(normalizeForMatch("Pittsburgh, PA!"), "pittsburgh pa");
  assert.deepEqual(tokenizeForMatch("123 Main Street Pittsburgh PA"), [
    "123",
    "main",
    "street",
    "pittsburgh"
  ]);
});

test("buildQualifiedGameLevels expands official experience to supported levels", () => {
  assert.deepEqual(
    Array.from(buildQualifiedGameLevels(new Set(["Varsity"]))),
    ["Varsity", "Junior Varsity", "Middle School", "Youth"]
  );
  assert.ok(buildQualifiedGameLevels(new Set(["NCAA DII"])).has("NCAA"));
});

test("getLocationClosenessScore rewards matching city/state/postal context", () => {
  const score = getLocationClosenessScore(openGame, {
    hasLocation: true,
    city: "pittsburgh",
    state: "pa",
    postalCode: "15222",
    tokens: ["main", "pittsburgh"]
  });

  assert.ok(score > 0.9);
});

test("filterAvailableMarketplaceGames excludes closed windows and direct assignments for officials", () => {
  const nowMs = new Date("2026-03-18T12:00:00.000Z").getTime();
  const closedGame: Game = {
    ...openGame,
    id: "closed",
    acceptingBidsUntilISO: "2026-03-17T12:00:00.000Z"
  };
  const directGame: Game = {
    ...openGame,
    id: "direct",
    mode: "direct_assignment",
    status: "awarded"
  };

  assert.deepEqual(
    filterAvailableMarketplaceGames([openGame, closedGame, directGame], "official", nowMs).map(
      (game) => game.id
    ),
    ["game-open"]
  );

  assert.deepEqual(
    filterAvailableMarketplaceGames([openGame, closedGame, directGame], "assignor", nowMs).map(
      (game) => game.id
    ),
    ["game-open"]
  );
});


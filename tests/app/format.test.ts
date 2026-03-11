import test from "node:test";
import assert from "node:assert/strict";

import {
  formatCurrency,
  formatGameDate,
  getBidWindowInfo,
  getGameStatusLabel
} from "../../src/lib/format";

test("formatCurrency renders whole-dollar USD values", () => {
  assert.equal(formatCurrency(150), "$150");
});

test("formatGameDate handles invalid input gracefully", () => {
  assert.equal(formatGameDate("not-a-date"), "Invalid date");
});

test("getBidWindowInfo handles awarded, unset, closing, open, and closed states", () => {
  const baseTime = new Date("2026-03-11T12:00:00.000Z").getTime();

  assert.deepEqual(getBidWindowInfo(undefined, "awarded", baseTime), {
    label: "Closed (awarded)",
    state: "closed"
  });
  assert.deepEqual(getBidWindowInfo(undefined, "open", baseTime), {
    label: "Open (no close time set)",
    state: "unset"
  });
  assert.deepEqual(getBidWindowInfo("2026-03-11T13:30:00.000Z", "open", baseTime), {
    label: "1h 30m left",
    state: "closing"
  });
  assert.deepEqual(getBidWindowInfo("2026-03-13T12:00:00.000Z", "open", baseTime), {
    label: "2d 0h left",
    state: "open"
  });
  assert.deepEqual(getBidWindowInfo("2026-03-11T11:00:00.000Z", "open", baseTime), {
    label: "Closed",
    state: "closed"
  });
});

test("getGameStatusLabel distinguishes direct assignments from marketplace awards", () => {
  assert.equal(getGameStatusLabel("open", "direct_assignment"), "Assigned");
  assert.equal(getGameStatusLabel("awarded", "marketplace"), "Awarded");
  assert.equal(getGameStatusLabel("open"), "Open");
});


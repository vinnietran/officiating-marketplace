import test from "node:test";
import assert from "node:assert/strict";

import {
  buildAvailabilityCalendarDays,
  formatAvailabilityDate,
  formatAvailabilityMonthLabel,
  getAvailabilityDateKeyFromDateTimeLocal,
  normalizeBlockedDateKeys
} from "../../src/lib/availability";

test("normalizeBlockedDateKeys sorts, deduplicates, and removes invalid values", () => {
  assert.deepEqual(
    normalizeBlockedDateKeys([
      "2026-04-12",
      "2026-04-12",
      "2026-04-03",
      "invalid",
      "2026-02-31"
    ]),
    ["2026-04-03", "2026-04-12"]
  );
});

test("getAvailabilityDateKeyFromDateTimeLocal returns the calendar day key", () => {
  assert.equal(getAvailabilityDateKeyFromDateTimeLocal("2026-10-05T18:30"), "2026-10-05");
  assert.equal(getAvailabilityDateKeyFromDateTimeLocal(""), null);
});

test("buildAvailabilityCalendarDays creates a 6 week grid for a month", () => {
  const days = buildAvailabilityCalendarDays("2026-03");
  assert.equal(days.length, 42);
  assert.equal(days[0]?.dateKey, "2026-03-01");
  assert.equal(days[41]?.dateKey, "2026-04-11");
  assert.equal(days.filter((day) => day.inCurrentMonth).length, 31);
});

test("availability labels format clearly for the UI", () => {
  assert.equal(formatAvailabilityMonthLabel("2026-10"), "October 2026");
  assert.equal(formatAvailabilityDate("2026-10-05"), "Oct 5, 2026");
});

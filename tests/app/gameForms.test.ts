import test from "node:test";
import assert from "node:assert/strict";

import {
  buildMarketplaceGameSubmission,
  toDateTimeLocalValue
} from "../../src/lib/gameForms";

test("buildMarketplaceGameSubmission trims text fields and converts local datetimes to ISO", () => {
  const result = buildMarketplaceGameSubmission({
    schoolName: " Central High ",
    sport: "Football",
    level: "Varsity",
    requestedCrewSize: "5",
    dateLocal: "2026-03-14T19:30",
    acceptingBidsUntilLocal: "2026-03-13T18:00",
    location: " 123 Main St ",
    payPosted: "125",
    notes: " Bring white hat "
  });

  assert.equal(result.schoolName, "Central High");
  assert.equal(result.location, "123 Main St");
  assert.equal(result.payPosted, 125);
  assert.equal(result.notes, "Bring white hat");
  assert.ok(result.dateISO.endsWith(":30:00.000Z") || result.dateISO.includes("T"));
  assert.ok(result.acceptingBidsUntilISO);
});

test("buildMarketplaceGameSubmission rejects invalid form states", () => {
  assert.throws(
    () =>
      buildMarketplaceGameSubmission({
        schoolName: "",
        sport: "Football",
        level: "Varsity",
        requestedCrewSize: "5",
        dateLocal: "2026-03-14T19:30",
        acceptingBidsUntilLocal: "",
        location: "",
        payPosted: "125",
        notes: ""
      }),
    /School and location are required/
  );

  assert.throws(
    () =>
      buildMarketplaceGameSubmission({
        schoolName: "Central High",
        sport: "Football",
        level: "Varsity",
        requestedCrewSize: "5",
        dateLocal: "2026-03-14T19:30",
        acceptingBidsUntilLocal: "2026-03-15T18:00",
        location: "123 Main St",
        payPosted: "125",
        notes: ""
      }),
    /Accepting bids until must be a valid date\/time before game start/
  );

  assert.throws(
    () =>
      buildMarketplaceGameSubmission({
        schoolName: "Central High",
        sport: "Football",
        level: "Varsity",
        requestedCrewSize: "5",
        dateLocal: "2026-03-14T19:30",
        acceptingBidsUntilLocal: "",
        location: "123 Main St",
        payPosted: "0",
        notes: ""
      }),
    /Posted pay must be greater than 0/
  );
});

test("toDateTimeLocalValue round-trips a local date for the edit form", () => {
  const localDate = new Date(2026, 2, 11, 13, 45);
  assert.equal(toDateTimeLocalValue(localDate.toISOString()), "2026-03-11T13:45");
  assert.equal(toDateTimeLocalValue("not-a-date"), "");
});

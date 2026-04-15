import test from "node:test";
import assert from "node:assert/strict";

import {
  buildMarketplaceGameSubmission,
  toDateTimeLocalValue
} from "../../src/lib/gameForms";
import {
  evaluateBidAgainstPreferredRange,
  getExpectedBidRangeLabel
} from "../../src/lib/bidRange";

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
    minBidAmount: "110",
    maxBidAmount: "150",
    notes: " Bring white hat "
  });

  assert.equal(result.schoolName, "Central High");
  assert.equal(result.location, "123 Main St");
  assert.equal(result.payPosted, 125);
  assert.equal(result.minBidAmount, 110);
  assert.equal(result.maxBidAmount, 150);
  assert.equal(result.notes, "Bring white hat");
  assert.equal(result.scheduledDateKey, "2026-03-14");
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
        minBidAmount: "",
        maxBidAmount: "",
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
        minBidAmount: "",
        maxBidAmount: "",
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
        requestedCrewSize: "1",
        dateLocal: "2026-03-14T19:30",
        acceptingBidsUntilLocal: "",
        location: "123 Main St",
        payPosted: "125",
        minBidAmount: "",
        maxBidAmount: "",
        notes: ""
      }),
    /Crew size needed must be a whole number from 2 to 11/
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
        minBidAmount: "",
        maxBidAmount: "",
        notes: ""
      }),
    /Posted pay must be greater than 0/
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
        payPosted: "125",
        minBidAmount: "100",
        maxBidAmount: "",
        notes: ""
      }),
    /Enter both minimum and maximum preferred bid amounts/
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
        payPosted: "125",
        minBidAmount: "120",
        maxBidAmount: "100",
        notes: ""
      }),
    /Maximum preferred bid must be greater than or equal to the minimum/
  );
});

test("toDateTimeLocalValue round-trips a local date for the edit form", () => {
  const localDate = new Date(2026, 2, 11, 13, 45);
  assert.equal(toDateTimeLocalValue(localDate.toISOString()), "2026-03-11T13:45");
  assert.equal(toDateTimeLocalValue("not-a-date"), "");
});

test("bid range helpers format and evaluate preferred ranges safely", () => {
  assert.equal(
    getExpectedBidRangeLabel({ minBidAmount: 100, maxBidAmount: 150 }),
    "$100 - $150"
  );
  assert.equal(getExpectedBidRangeLabel({ minBidAmount: 100 }), null);

  assert.equal(
    evaluateBidAgainstPreferredRange(90, { minBidAmount: 100, maxBidAmount: 150 }).direction,
    "below"
  );
  assert.equal(
    evaluateBidAgainstPreferredRange(125, { minBidAmount: 100, maxBidAmount: 150 }).direction,
    "within"
  );
  assert.equal(
    evaluateBidAgainstPreferredRange(175, { minBidAmount: 100, maxBidAmount: 150 }).direction,
    "above"
  );
  assert.equal(
    evaluateBidAgainstPreferredRange(175, { minBidAmount: undefined, maxBidAmount: undefined })
      .hasPreferredRange,
    false
  );
});

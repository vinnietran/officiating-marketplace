import test from "node:test";
import assert from "node:assert/strict";

import {
  filterOutPullRequests,
  hasAnyLabel,
  isWithinReportWindow,
  selectIssuesByLabels,
} from "../github.mjs";

test("filterOutPullRequests excludes pull request issue payloads", () => {
  const items = [
    { number: 1, title: "Issue" },
    { number: 2, title: "PR masquerading as issue", pull_request: { url: "https://api.github.com/pr/2" } },
  ];

  assert.deepEqual(filterOutPullRequests(items), [{ number: 1, title: "Issue" }]);
});

test("selectIssuesByLabels matches any configured label", () => {
  const issues = [
    { title: "One", labels: [{ name: "backlog" }] },
    { title: "Two", labels: [{ name: "doing" }] },
    { title: "Three", labels: [{ name: "active" }] },
  ];

  assert.deepEqual(selectIssuesByLabels(issues, ["doing", "active"]).map((issue) => issue.title), [
    "Two",
    "Three",
  ]);
});

test("hasAnyLabel is case-insensitive", () => {
  const issue = { labels: [{ name: "In-Progress" }] };
  assert.equal(hasAnyLabel(issue, ["in-progress"]), true);
});

test("isWithinReportWindow respects inclusive boundaries", () => {
  const reportWindow = {
    start: new Date("2026-03-01T00:00:00.000Z"),
    end: new Date("2026-03-07T23:59:59.999Z"),
  };

  assert.equal(isWithinReportWindow("2026-03-01T00:00:00.000Z", reportWindow), true);
  assert.equal(isWithinReportWindow("2026-03-07T23:59:59.999Z", reportWindow), true);
  assert.equal(isWithinReportWindow("2026-03-08T00:00:00.000Z", reportWindow), false);
});


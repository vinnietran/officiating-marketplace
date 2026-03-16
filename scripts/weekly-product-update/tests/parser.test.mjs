import test from "node:test";
import assert from "node:assert/strict";

import { extractBullets, parseStoryDetails, stripMarkdown } from "../parser.mjs";

test("parseStoryDetails uses structured headings when present", () => {
  const issue = {
    number: 24,
    title: "Build game posting flow",
    html_url: "https://github.com/example/officiating-marketplace/issues/24",
    body: `## Summary
Schools need a quick way to publish open games to the marketplace.

## Acceptance Criteria
- Schools can create a posting with date, location, and pay rate
- Schools can publish the posting so officials can discover it

## Validation
Manual end-to-end testing completed in the development environment.`,
  };

  const parsed = parseStoryDetails(issue);

  assert.equal(parsed.story, "Schools need a quick way to publish open games to the marketplace.");
  assert.equal(
    parsed.storyDetail,
    "Summary\nSchools need a quick way to publish open games to the marketplace.\n\nAcceptance Criteria\nSchools can create a posting with date, location, and pay rate\nSchools can publish the posting so officials can discover it\n\nValidation\nManual end-to-end testing completed in the development environment.",
  );
  assert.equal(
    parsed.completedOutcome,
    "Schools can now create a posting with date, location, and pay rate.",
  );
  assert.equal(
    parsed.validation,
    "Manual end-to-end testing completed in the development environment.",
  );
});

test("parseStoryDetails falls back to the first paragraph for unstructured bodies", () => {
  const issue = {
    number: 32,
    title: "Tighten onboarding prompts",
    html_url: "https://github.com/example/officiating-marketplace/issues/32",
    body: `Officials were abandoning profile setup before providing enough information to match them with games.

This work should reduce the number of incomplete signups.`,
  };

  const parsed = parseStoryDetails(issue);

  assert.equal(
    parsed.story,
    "Officials were abandoning profile setup before providing enough information to match them with games.",
  );
  assert.equal(
    parsed.storyDetail,
    "Officials were abandoning profile setup before providing enough information to match them with games.\n\nThis work should reduce the number of incomplete signups.",
  );
  assert.equal(
    parsed.completedOutcome,
    "Officials were abandoning profile setup before providing enough information to match them with games.",
  );
  assert.equal(parsed.validation, "Validation details were not captured in the issue.");
});

test("parseStoryDetails handles missing sections without crashing", () => {
  const issue = {
    number: 41,
    title: "Refine messaging follow-up",
    html_url: "https://github.com/example/officiating-marketplace/issues/41",
    body: "",
  };

  const parsed = parseStoryDetails(issue);

  assert.equal(parsed.story, "Refine messaging follow-up.");
  assert.equal(parsed.storyDetail, "Refine messaging follow-up.");
  assert.equal(parsed.completedOutcome, "This work is complete and is now available in the product.");
  assert.equal(parsed.validation, "Validation details were not captured in the issue.");
});

test("extractBullets returns cleaned acceptance criteria", () => {
  const bullets = extractBullets(`
- Users can update their profile
- [x] Users can submit profile changes
1. Users can review saved changes
`);

  assert.deepEqual(bullets, [
    "Users can update their profile",
    "Users can submit profile changes",
    "Users can review saved changes",
  ]);
});

test("stripMarkdown removes common markdown noise", () => {
  assert.equal(
    stripMarkdown("**Bold** [link](https://example.com) `code`"),
    "Bold link code",
  );
});

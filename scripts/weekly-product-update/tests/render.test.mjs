import test from "node:test";
import assert from "node:assert/strict";

import { createSampleReport } from "../sample-report.mjs";
import { renderEmailHtml, renderEmailText } from "../render.mjs";

test("renderEmailHtml includes no-results messaging when no completed stories exist", () => {
  const report = createSampleReport();
  report.completedStories = [];

  const html = renderEmailHtml(report);

  assert.match(html, /No completed milestones were finalized in this reporting period\./);
  assert.match(html, /Currently In Progress/);
  assert.match(html, /Quality Check/);
});

test("renderEmailHtml renders client-facing content without GitHub links", () => {
  const report = createSampleReport();
  const html = renderEmailHtml(report);

  assert.match(html, /V&amp;S Ventures LLC/);
  assert.match(html, /Build game posting flow/);
  assert.match(html, /What was delivered:/);
  assert.doesNotMatch(html, /View issue/);
  assert.doesNotMatch(html, /github\.com/);
});

test("renderEmailText includes the key stakeholder sections", () => {
  const report = createSampleReport();
  const text = renderEmailText(report);

  assert.match(text, /Completed this period:/);
  assert.match(text, /Currently in progress:/);
  assert.match(text, /Quality check:/);
  assert.doesNotMatch(text, /https:\/\/github\.com/);
});

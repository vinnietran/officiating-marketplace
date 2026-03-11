import test from "node:test";
import assert from "node:assert/strict";

import { createSampleReport } from "../sample-report.mjs";
import { renderEmailHtml, renderEmailText } from "../render.mjs";

test("renderEmailHtml includes no-results messaging when no completed stories exist", () => {
  const report = createSampleReport();
  report.completedStories = [];

  const html = renderEmailHtml(report);

  assert.match(html, /No completed stories this period\./);
  assert.match(html, /In-Progress Work/);
  assert.match(html, /Recent Test\/Build Summary/);
});

test("renderEmailHtml renders completed story content", () => {
  const report = createSampleReport();
  const html = renderEmailHtml(report);

  assert.match(html, /Issue #24 - Build game posting flow/);
  assert.match(html, /School users can now create and publish a game posting visible in the marketplace\./);
});

test("renderEmailText includes the key stakeholder sections", () => {
  const report = createSampleReport();
  const text = renderEmailText(report);

  assert.match(text, /Completed stories:/);
  assert.match(text, /In-progress work:/);
  assert.match(text, /Recent test\/build summary:/);
});


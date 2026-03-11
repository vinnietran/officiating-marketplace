import test from "node:test";
import assert from "node:assert/strict";

import {
  formatRoleLabel,
  getAuthErrorMessage,
  getFallbackDisplayName,
  getHomeRouteRedirect,
  resolveProfileDisplayName
} from "../../src/lib/auth";

test("formatRoleLabel capitalizes user roles for auth and profile screens", () => {
  assert.equal(formatRoleLabel("assignor"), "Assignor");
  assert.equal(formatRoleLabel("evaluator"), "Evaluator");
});

test("getAuthErrorMessage maps common Firebase auth errors", () => {
  assert.equal(
    getAuthErrorMessage({ message: "FirebaseError: auth/email-already-in-use" }),
    "This email is already in use."
  );
  assert.equal(
    getAuthErrorMessage({ message: "FirebaseError: auth/invalid-credential" }),
    "Invalid email or password."
  );
});

test("profile name helpers fall back to the email prefix", () => {
  assert.equal(getFallbackDisplayName("captain@example.com"), "captain");
  assert.equal(resolveProfileDisplayName("  ", "captain@example.com"), "captain");
  assert.equal(resolveProfileDisplayName(" Crew Chief ", "captain@example.com"), "Crew Chief");
});

test("getHomeRouteRedirect routes anonymous, authenticated, and evaluator users correctly", () => {
  assert.equal(
    getHomeRouteRedirect({
      loading: true,
      hasUser: false,
      profileLoading: false,
      role: null
    }),
    null
  );

  assert.equal(
    getHomeRouteRedirect({
      loading: false,
      hasUser: false,
      profileLoading: false,
      role: null
    }),
    "/login"
  );

  assert.equal(
    getHomeRouteRedirect({
      loading: false,
      hasUser: true,
      profileLoading: false,
      role: "official"
    }),
    "/dashboard"
  );

  assert.equal(
    getHomeRouteRedirect({
      loading: false,
      hasUser: true,
      profileLoading: false,
      role: "evaluator"
    }),
    "/schedule"
  );
});


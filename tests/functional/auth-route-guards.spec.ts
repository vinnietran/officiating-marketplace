import { expect, test } from "@playwright/test";
import {
  dismissAlert,
  selectOption,
  signIn,
  signOutFromProfile,
  withScenario
} from "./helpers";

test("guards marketplace access for guests and blocks officials from posting games", async ({
  page
}) => {
  await page.goto(withScenario("/marketplace"));

  await expect(page.getByRole("heading", { name: "Officiating Marketplace" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Sign In" })).toBeVisible();

  await signIn(page, "official1@example.com");
  await expect(page.getByRole("heading", { name: "Official Dashboard" })).toBeVisible();

  await page.goto("/login");
  await expect(page.getByRole("heading", { name: "Official Dashboard" })).toBeVisible();

  await page.goto("/post-game");
  await expect(page.getByRole("heading", { name: "Post a Game" })).toBeVisible();
  await expect(page.getByText("Only assignors and schools can post games.")).toBeVisible();

  await signOutFromProfile(page);
  await page.goto("/marketplace");
  await expect(page.getByRole("heading", { name: "Sign In" })).toBeVisible();
});

test("signs up a new school account and routes it into the operations workspace", async ({
  page
}) => {
  await page.goto(withScenario("/login"));

  await page.getByRole("button", { name: "Need an account?" }).click();
  await expect(page.getByRole("heading", { name: "Create Account" })).toBeVisible();

  await page.getByLabel("Email").fill("new-school@example.com");
  await page.getByLabel("Password").fill("Password123!");
  await page.getByLabel("Display Name").fill("Taylor School Ops");
  await selectOption(page, page.locator("form"), "Role", "School");
  await page.getByRole("button", { name: "Create Account" }).click();

  const main = page.getByRole("main");
  await expect(main.getByRole("heading", { name: "Operations Dashboard" })).toBeVisible();
  await expect(main.getByRole("link", { name: "Post a Game" })).toBeVisible();

  await page.goto("/profile");
  await expect(page.getByText("My Profile")).toBeVisible();
  await expect(page.locator("h1", { hasText: "Taylor School Ops" })).toBeVisible();
  await expect(page.locator(".profile-role-pill", { hasText: "School" }).first()).toBeVisible();

  await signOutFromProfile(page);

  await signIn(page, "new-school@example.com");
  await expect(main.getByRole("heading", { name: "Operations Dashboard" })).toBeVisible();

  await page.goto("/post-game");
  await expect(page.getByRole("heading", { name: "Post a Game" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Post Game" })).toBeVisible();

  await signOutFromProfile(page);
  await dismissAlert(page);
});

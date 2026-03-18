import { expect, test } from "@playwright/test";
import {
  dismissAlert,
  selectOption,
  signIn,
  signOutFromProfile,
  withScenario
} from "./helpers";

test("creates a marketplace bid for an open game", async ({ page }) => {
  await page.goto(withScenario("/login"));

  await signIn(page, "assignor@example.com");
  await page.goto("/post-game");
  await page.getByLabel("School Name").fill("Bid Test Academy");
  await selectOption(page, page.locator("form"), "Level", "Junior Varsity");
  await page.getByLabel("Date & Time").fill("2030-09-12T19:00");
  await page.getByLabel("Accepting Bids Until").fill("2030-09-10T18:00");
  await page.getByLabel("Location").fill("200 Market St, Pittsburgh, PA");
  await page.getByLabel("Posted Pay (USD)").fill("145");
  await page.getByLabel("Notes (Optional)").fill("Functional bid creation test.");
  await page.getByRole("button", { name: "Post Game" }).click();
  await expect(page.getByText("Game Posted")).toBeVisible();
  await dismissAlert(page);
  await signOutFromProfile(page);

  await signIn(page, "official1@example.com");
  await page.goto("/marketplace");

  const gameCard = page.locator(".game-card").filter({ hasText: "Bid Test Academy" }).first();
  await expect(gameCard).toBeVisible();
  await gameCard.getByRole("button", { name: "Place Bid" }).click();

  await page.getByLabel("Bid Amount (USD)").fill("160");
  await page.getByRole("button", { name: "Place Bid" }).click();

  await expect(page.getByText("Bid Submitted")).toBeVisible();
  await dismissAlert(page);
  await expect(gameCard).toContainText("Your highest active offer:");
  await expect(gameCard).toContainText("$160");
});

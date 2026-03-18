import { expect, test } from "@playwright/test";
import {
  dismissAlert,
  selectOption,
  selectOptionInRegion,
  signIn,
  signOutFromProfile,
  withScenario
} from "./helpers";

test("captures post-game ratings from both assignor and official perspectives", async ({
  page
}) => {
  await page.goto(withScenario("/login"));

  await signIn(page, "assignor@example.com");
  await page.goto("/post-game");
  await page.getByLabel("School Name").fill("Riverside Prep");
  await selectOption(page, page.locator("form"), "Level", "Junior Varsity");
  await page.getByLabel("Date & Time").fill("2030-09-10T19:00");
  await page.getByLabel("Accepting Bids Until").fill("2030-09-08T18:00");
  await page.getByLabel("Location").fill("10 River Rd, Pittsburgh, PA");
  await page.getByLabel("Posted Pay (USD)").fill("145");
  await page.getByRole("button", { name: "Post Game" }).click();
  await expect(page.getByText("Game Posted")).toBeVisible();
  await dismissAlert(page);
  await signOutFromProfile(page);

  await signIn(page, "official1@example.com");
  await page.goto("/marketplace");
  const ratingGameCard = page.locator(".game-card").filter({ hasText: "Riverside Prep" }).first();
  await ratingGameCard.getByRole("button", { name: "Place Bid" }).click();
  await page.getByLabel("Bid Amount (USD)").fill("160");
  await page.getByRole("button", { name: "Place Bid" }).click();
  await expect(page.getByText("Bid Submitted")).toBeVisible();
  await dismissAlert(page);
  await signOutFromProfile(page);

  await signIn(page, "assignor@example.com");
  await page.goto("/schedule");
  await page.getByRole("button", { name: /Open details for Riverside Prep/i }).click();
  await page.getByRole("button", { name: "Select Bid" }).click();
  await expect(page.getByText("Bid Selected")).toBeVisible();
  await dismissAlert(page);

  await page.evaluate(() => {
    const controller = window.__OFFICIATING_E2E__;
    if (!controller) {
      return;
    }

    const nextState = controller.getState();
    const game = nextState.games.find((candidate) => candidate.schoolName === "Riverside Prep");
    if (!game) {
      return;
    }

    game.dateISO = "2020-09-10T19:00:00.000Z";
    game.acceptingBidsUntilISO = "2020-09-08T18:00:00.000Z";
    controller.replaceState(nextState);
  });
  await page.reload();

  const ratingsSection = page.locator(".details-card").filter({
    has: page.getByRole("heading", { name: "Post-Game Ratings" })
  });
  await ratingsSection.getByRole("button", { name: "Rate" }).first().click();
  await ratingsSection.locator('textarea').fill("Strong communication and pacing.");
  await ratingsSection.getByRole("button", { name: "Save Rating" }).click();
  await expect(page.getByText("Rating Saved")).toBeVisible();
  await dismissAlert(page);
  await expect(
    ratingsSection.locator("tbody tr").filter({ hasText: "Olivia Official" }).first()
  ).toContainText("5/5");
  await signOutFromProfile(page);

  await signIn(page, "official1@example.com");
  await page.goto("/schedule");
  await page.getByRole("button", { name: /Open details for Riverside Prep/i }).click();
  const officialRatingsSection = page.locator(".details-card").filter({
    has: page.getByRole("heading", { name: "Post-Game Ratings" })
  });
  await officialRatingsSection.getByRole("button", { name: "Rate" }).first().click();
  await selectOptionInRegion(page, officialRatingsSection.locator(".rating-edit-row"), "4");
  await officialRatingsSection.locator('textarea').fill("Clear logistics and timely communication.");
  await officialRatingsSection.getByRole("button", { name: "Save Rating" }).click();
  await expect(page.getByText("Rating Saved")).toBeVisible();
  await dismissAlert(page);
  await expect(
    officialRatingsSection.locator("tbody tr").filter({ hasText: "Riverside Prep" }).first()
  ).toContainText("4/5");
});

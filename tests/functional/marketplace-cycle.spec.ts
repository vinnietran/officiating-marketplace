import { expect, test } from "@playwright/test";
import {
  createCrew,
  dismissAlert,
  selectOption,
  signIn,
  signOutFromProfile,
  withScenario
} from "./helpers";

test("runs the crew-bid marketplace workflow end to end", async ({ page }) => {
  await page.goto(withScenario("/login"));

  await signIn(page, "official1@example.com");
  await createCrew(page, {
    crewName: "Friday Varsity Crew",
    inviteEmail: "official2@example.com",
    creatorName: "Olivia Official",
    inviteeName: "Noah Official"
  });

  await signOutFromProfile(page);

  await signIn(page, "assignor@example.com");
  await page.goto("/post-game");
  await page.getByLabel("School Name").fill("Central Catholic");
  await selectOption(page, page.locator("form"), "Crew Size Needed", "2 officials");
  await page.getByLabel("Date & Time").fill("2030-09-10T19:00");
  await page.getByLabel("Accepting Bids Until").fill("2030-09-08T18:00");
  await page.getByLabel("Location").fill("100 Stadium Dr, Pittsburgh, PA");
  await page.getByLabel("Posted Pay (USD)").fill("250");
  await page.getByLabel("Notes (Optional)").fill("Varsity crew needed.");
  await page.getByRole("button", { name: "Post Game" }).click();
  await expect(page.getByText("Game Posted")).toBeVisible();
  await dismissAlert(page);

  await page.goto("/marketplace");
  const gameCard = page.locator(".game-card").filter({ hasText: "Central Catholic" }).first();
  await gameCard.getByRole("button", { name: "Edit Game" }).click();
  await page.getByLabel("Posted Pay (USD)").fill("275");
  await page.getByRole("button", { name: "Save Changes" }).click();
  await signOutFromProfile(page);

  await signIn(page, "official1@example.com");
  await page.goto("/marketplace");
  const officialGameCard = page.locator(".game-card").filter({ hasText: "Central Catholic" }).first();
  await expect(officialGameCard.getByText("CREW BID REQUIRED")).toBeVisible();
  await expect(officialGameCard).toContainText("Crew of 2");
  await officialGameCard.click();
  await page.getByRole("button", { name: "Place / Update Bid" }).click();
  await page.getByLabel("Bid Amount (USD)").fill("300");
  await page.getByRole("button", { name: "Place Bid" }).click();
  await expect(page.getByText("Bid Submitted")).toBeVisible();
  await dismissAlert(page);
  const bidsSection = page.locator(".details-card").filter({
    has: page.getByRole("heading", { name: "Bid On This Game" })
  });
  await expect(bidsSection.getByText("Your bids on this game")).toBeVisible();
  await expect(bidsSection.getByText("$300", { exact: true })).toBeVisible();

  await page.getByRole("button", { name: "Place / Update Bid" }).click();
  await page.getByRole("button", { name: "Update Bid" }).click();
  await expect(page.getByText("Offer Increased")).toBeVisible();
  await dismissAlert(page);
  await expect(bidsSection.getByText("$301", { exact: true })).toBeVisible();
  await expect(bidsSection.getByText("$300", { exact: true })).not.toBeVisible();
  await signOutFromProfile(page);

  await signIn(page, "assignor@example.com");
  await page.goto("/schedule");
  await page
    .getByRole("button", { name: /Open details for Central Catholic/i })
    .click();
  await page.getByRole("button", { name: "Select Bid" }).click();
  await expect(page.getByText("Bid Selected")).toBeVisible();
  await dismissAlert(page);
  await expect(page.getByText("Status: Awarded")).toBeVisible();
  await signOutFromProfile(page);

  await signIn(page, "official1@example.com");
  await page.goto("/schedule");
  await expect(page.getByText("Central Catholic")).toBeVisible();
  await page
    .getByRole("button", { name: /Open details for Central Catholic/i })
    .click();
  await expect(page.getByText("Crew of 2")).toBeVisible();
  await expect(page.getByText("Assigned Individuals")).toBeVisible();
  await expect(page.getByRole("cell", { name: "Olivia Official" })).toBeVisible();
});

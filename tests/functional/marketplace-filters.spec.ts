import { expect, test, type Page } from "@playwright/test";
import { selectOption, signIn, withScenario } from "./helpers";

async function seedMarketplaceListings(page: Page) {
  await page.evaluate(() => {
    const controller = window.__OFFICIATING_E2E__;
    if (!controller) {
      throw new Error("Missing e2e controller.");
    }

    const state = controller.getState();
    const createdAtISO = "2030-08-01T12:00:00.000Z";

    state.games = [
      {
        id: "game-alpha",
        schoolName: "Alpha Academy",
        sport: "Basketball",
        level: "Junior Varsity",
        dateISO: "2030-09-20T19:00:00.000Z",
        acceptingBidsUntilISO: "2030-09-18T18:00:00.000Z",
        location: "100 Alpha Ave, Pittsburgh, PA",
        payPosted: 110,
        createdByUid: "assignor-1",
        createdByName: "Alex Assignor",
        createdByRole: "assignor",
        createdAtISO,
        status: "open",
        mode: "marketplace"
      },
      {
        id: "game-bravo",
        schoolName: "Bravo High",
        sport: "Soccer",
        level: "Middle School",
        dateISO: "2030-09-14T17:30:00.000Z",
        acceptingBidsUntilISO: "2030-09-12T17:00:00.000Z",
        location: "200 Bravo Blvd, Pittsburgh, PA",
        payPosted: 240,
        createdByUid: "assignor-1",
        createdByName: "Alex Assignor",
        createdByRole: "assignor",
        createdAtISO,
        status: "open",
        mode: "marketplace"
      },
      {
        id: "game-charlie",
        schoolName: "Charlie Prep",
        sport: "Baseball",
        level: "Youth",
        dateISO: "2030-09-25T18:00:00.000Z",
        acceptingBidsUntilISO: "2030-09-22T18:00:00.000Z",
        location: "300 Charlie Cir, Pittsburgh, PA",
        payPosted: 175,
        createdByUid: "school-1",
        createdByName: "Sam School",
        createdByRole: "school",
        createdAtISO,
        status: "open",
        mode: "marketplace"
      }
    ];

    state.bids = [
      {
        id: "bid-bravo-official1",
        gameId: "game-bravo",
        officialUid: "official-1",
        officialName: "Olivia Official",
        bidderType: "individual",
        amount: 255,
        createdAtISO
      }
    ];

    controller.replaceState(state);
  });
}

test("filters, sorts, and deletes an existing marketplace bid", async ({ page }) => {
  await page.goto(withScenario("/login"));
  await seedMarketplaceListings(page);

  await signIn(page, "official1@example.com");
  await page.goto("/marketplace");

  const listings = page.locator(".marketplace-game-list .game-card");
  await expect(listings).toHaveCount(3);

  await page.getByLabel("School").fill("Bravo");
  await expect(page.locator(".marketplace-game-list .game-card h3")).toHaveText(["Bravo High"]);

  await page.getByRole("button", { name: "Clear Filters" }).click();
  await expect(listings).toHaveCount(3);

  await selectOption(page, page.locator(".filters"), "Sport", "Soccer");
  await page.getByLabel("Minimum Pay").fill("200");
  await expect(page.locator(".marketplace-game-list .game-card h3")).toHaveText(["Bravo High"]);

  await page.getByLabel("Start Date").fill("2030-09-14");
  await page.getByLabel("End Date").fill("2030-09-14");
  await expect(page.locator(".marketplace-game-list .game-card h3")).toHaveText(["Bravo High"]);
  await expect(page).toHaveURL(/startDate=2030-09-14/);
  await expect(page).toHaveURL(/endDate=2030-09-14/);

  await page
    .locator(".marketplace-game-list .game-card")
    .filter({ hasText: "Bravo High" })
    .first()
    .click();
  await expect(page.getByRole("heading", { name: "Game Details" })).toBeVisible();
  await page.getByRole("link", { name: "Back to Marketplace" }).click();
  await expect(page.getByRole("heading", { name: "Available Games" })).toBeVisible();
  await expect(page.locator(".marketplace-game-list .game-card h3")).toHaveText(["Bravo High"]);

  await page.getByRole("button", { name: "Clear Filters" }).click();
  await page.getByRole("button", { name: /Open Bids \(1\)/ }).click();
  await expect(page.getByRole("heading", { name: "Open Bid Games" })).toBeVisible();
  await expect(page.locator(".marketplace-game-list .game-card h3")).toHaveText(["Bravo High"]);

  await page.getByRole("button", { name: /All Games \(3\)/ }).click();
  await selectOption(page, page, "Sort By", "Pay: Highest First");

  const sortedTitles = page.locator(".marketplace-game-list .game-card h3");
  await expect(sortedTitles.nth(0)).toHaveText("Bravo High");
  await expect(sortedTitles.nth(1)).toHaveText("Charlie Prep");
  await expect(sortedTitles.nth(2)).toHaveText("Alpha Academy");

  const bravoCard = listings.filter({ hasText: "Bravo High" }).first();
  const alphaCard = listings.filter({ hasText: "Alpha Academy" }).first();
  await expect(bravoCard).toContainText("Your Bid:");
  await expect(alphaCard).not.toContainText("Your Bid:");
  await bravoCard.getByRole("button", { name: "Delete" }).click();

  await expect(page.getByRole("button", { name: /Open Bids \(0\)/ })).toBeVisible();
  await expect(bravoCard).not.toContainText("Your Bid:");

  await page
    .getByRole("button", { name: /Open Bids \(0\)/ })
    .evaluate((button: HTMLButtonElement) => button.click());
  await expect(page.getByText("No games match your filters.")).toBeVisible();
});

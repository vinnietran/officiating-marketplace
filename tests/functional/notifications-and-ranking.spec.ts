import { expect, test, type Page } from "@playwright/test";
import {
  dismissAlert,
  signIn,
  withScenario
} from "./helpers";

async function seedOfficialLocationAndRankedGames(page: Page) {
  await page.evaluate(() => {
    const controller = window.__OFFICIATING_E2E__;
    if (!controller) {
      throw new Error("E2E harness is not available.");
    }

    const nextState = controller.getState();
    nextState.currentUserId = "official-1";

    const official = nextState.profiles.find((profile) => profile.uid === "official-1");
    if (official) {
      official.levelsOfficiated = ["Varsity"];
      official.contactInfo = {
        addressLine1: "100 Home St",
        city: "Pittsburgh",
        state: "PA",
        postalCode: "15222"
      };
      official.locationCoordinates = { lat: 40, lng: -80 };
    }

    nextState.games = [
      {
        id: "game-near",
        schoolName: "Nearby Prep",
        sport: "Football",
        level: "Junior Varsity",
        dateISO: "2030-11-02T19:00:00.000Z",
        acceptingBidsUntilISO: "2030-10-31T18:00:00.000Z",
        location: "12 Near St, Pittsburgh, PA",
        locationCoordinates: { lat: 40.01, lng: -80 },
        payPosted: 160,
        createdByUid: "assignor-1",
        createdByName: "Alex Assignor",
        createdByRole: "assignor",
        createdAtISO: "2030-10-01T12:00:00.000Z",
        status: "open",
        mode: "marketplace"
      },
      {
        id: "game-middle",
        schoolName: "Midway Academy",
        sport: "Football",
        level: "Varsity",
        dateISO: "2030-11-03T19:00:00.000Z",
        acceptingBidsUntilISO: "2030-10-31T18:00:00.000Z",
        location: "300 Mid St, Pittsburgh, PA",
        locationCoordinates: { lat: 40.05, lng: -80.02 },
        payPosted: 240,
        createdByUid: "assignor-1",
        createdByName: "Alex Assignor",
        createdByRole: "assignor",
        createdAtISO: "2030-10-01T12:05:00.000Z",
        status: "open",
        mode: "marketplace"
      },
      {
        id: "game-far",
        schoolName: "Distant High",
        sport: "Football",
        level: "Varsity",
        dateISO: "2030-11-04T19:00:00.000Z",
        acceptingBidsUntilISO: "2030-10-31T18:00:00.000Z",
        location: "900 Far Ave, Youngstown, OH",
        locationCoordinates: { lat: 41, lng: -81 },
        payPosted: 320,
        createdByUid: "assignor-1",
        createdByName: "Alex Assignor",
        createdByRole: "assignor",
        createdAtISO: "2030-10-01T12:10:00.000Z",
        status: "open",
        mode: "marketplace"
      }
    ];

    nextState.bids = [];
    nextState.ratings = [];
    nextState.evaluations = [];

    controller.replaceState(nextState);
  });
}

async function seedMarketplaceBid(page: Page) {
  await page.evaluate(() => {
    const controller = window.__OFFICIATING_E2E__;
    if (!controller) {
      throw new Error("E2E harness is not available.");
    }

    const nextState = controller.getState();
    const game = nextState.games.find(
      (candidate) => candidate.schoolName === "Notification Test Academy"
    );
    if (!game) {
      throw new Error("Notification test game was not found.");
    }

    nextState.currentUserId = "official-1";
    nextState.bids.push({
      id: "bid-notification-1",
      gameId: game.id,
      officialUid: "official-1",
      officialName: "Olivia Official",
      bidderType: "individual",
      amount: 170,
      message: "Ready to cover the game.",
      createdAtISO: "2030-09-08T17:00:00.000Z"
    });
    controller.replaceState(nextState);
  });
}

async function setCurrentUser(page: Page, userId: string | null) {
  await page.evaluate((nextUserId: string | null) => {
    const controller = window.__OFFICIATING_E2E__;
    if (!controller) {
      throw new Error("E2E harness is not available.");
    }

    const nextState = controller.getState();
    nextState.currentUserId = nextUserId;
    controller.replaceState(nextState);
  }, userId);
}

test("shows bid notifications and ranks marketplace games by proximity", async ({ page }) => {
  await page.goto(withScenario("/login"));

  await signIn(page, "assignor@example.com");
  await page.goto("/post-game");
  await page.getByLabel("School Name").fill("Notification Test Academy");
  await page.getByLabel("Date & Time").fill("2030-09-10T19:00");
  await page.getByLabel("Accepting Bids Until").fill("2030-09-08T18:00");
  await page.getByLabel("Location").fill("10 Signal Rd, Pittsburgh, PA");
  await page.getByLabel("Posted Pay (USD)").fill("145");
  await page.getByRole("button", { name: "Post Game" }).click();
  await expect(page.getByText("Game Posted")).toBeVisible();
  await dismissAlert(page);

  await setCurrentUser(page, "official-1");
  await page.goto("/marketplace");
  await seedMarketplaceBid(page);
  await setCurrentUser(page, "assignor-1");

  await page.goto("/schedule");
  await page
    .getByRole("button", { name: /Open details for Notification Test Academy/i })
    .click();
  await page.getByRole("button", { name: "Select Bid" }).click();
  await expect(page.getByText("Bid Selected")).toBeVisible();
  await dismissAlert(page);
  await setCurrentUser(page, "official-1");

  await page.goto("/marketplace");

  const notificationsButton = page.getByRole("button", { name: /Notifications \(1 unread\)/i });
  await expect(notificationsButton).toBeVisible();
  await notificationsButton.click();
  await expect(page.getByRole("menuitem", { name: /Bid Won/i })).toBeVisible();
  await page.getByRole("menuitem", { name: /Bid Won/i }).click();

  await expect(page.getByRole("heading", { name: "Game Details" })).toBeVisible();
  await expect(page.getByText("Notification Test Academy")).toBeVisible();
  await expect(page.getByText("Assigned by: Alex Assignor")).toBeVisible();

  await page.goto("/marketplace");
  await page.getByRole("button", { name: /Notifications \(\d+ unread\)/i }).click();
  await page.getByRole("button", { name: "Clear all" }).click();
  await expect(page.getByText("No notifications yet.")).toBeVisible();

  await setCurrentUser(page, "official-1");
  await seedOfficialLocationAndRankedGames(page);
  await page.goto("/marketplace");

  await expect(page.getByText("Closest game")).toBeVisible();
  await expect(page.locator(".marketplace-game-list .game-card").filter({ hasText: "Nearby Prep" }).first()).toBeVisible();

  await page.locator(".marketplace-sort-control .ui-select-trigger").click();
  await page.getByText("Closest First").click();
  const firstListing = page.locator(".marketplace-game-list .game-card").first();
  await expect(firstListing).toContainText("Nearby Prep");
});

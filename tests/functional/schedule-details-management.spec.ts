import { expect, test, type Page } from "@playwright/test";
import {
  dismissAlert,
  selectOptionInRegion,
  signIn,
  signOutFromProfile,
  withScenario
} from "./helpers";

async function seedAwardedGameWithExistingSubmissions(page: Page) {
  await page.evaluate(() => {
    const controller = window.__OFFICIATING_E2E__;
    if (!controller) {
      throw new Error("E2E harness is not available.");
    }

    const nextState = controller.getState();
    nextState.currentUserId = "assignor-1";

    nextState.games = [
      {
        id: "game-1",
        schoolName: "Replay Academy",
        sport: "Football",
        level: "Junior Varsity",
        dateISO: "2024-09-10T19:00:00.000Z",
        acceptingBidsUntilISO: "2024-09-08T18:00:00.000Z",
        location: "10 Replay Rd, Pittsburgh, PA",
        payPosted: 175,
        notes: "Initial posted game used to verify edits.",
        createdByUid: "assignor-1",
        createdByName: "Alex Assignor",
        createdByRole: "assignor",
        createdAtISO: "2024-09-01T12:00:00.000Z",
        status: "awarded",
        mode: "marketplace",
        selectedBidId: "bid-1"
      }
    ];

    nextState.bids = [
      {
        id: "bid-1",
        gameId: "game-1",
        officialUid: "official-1",
        officialName: "Olivia Official",
        bidderType: "individual",
        amount: 190,
        message: "Ready to work the assignment.",
        createdAtISO: "2024-09-08T15:00:00.000Z"
      }
    ];

    nextState.ratings = [
      {
        id: "rating-1",
        gameId: "game-1",
        targetType: "official",
        targetId: "official-1",
        ratedByUid: "assignor-1",
        ratedByRole: "assignor",
        stars: 3,
        comment: "Handled the first pass well.",
        createdAtISO: "2024-09-10T22:00:00.000Z",
        updatedAtISO: "2024-09-10T22:00:00.000Z"
      }
    ];

    nextState.evaluations = [
      {
        id: "evaluation-1",
        gameId: "game-1",
        evaluatorUid: "evaluator-1",
        overallScore: 2,
        notes: "Needs a second look.",
        createdAtISO: "2024-09-10T22:15:00.000Z",
        updatedAtISO: "2024-09-10T22:15:00.000Z"
      }
    ];

    nextState.counters = {
      ...nextState.counters,
      game: 1,
      bid: 1,
      rating: 1,
      evaluation: 1
    };

    controller.replaceState(nextState);
  });
}

test("deletes games from schedule details and edits previously submitted feedback", async ({
  page
}) => {
  await page.goto(withScenario("/login"));

  await signIn(page, "assignor@example.com");
  await page.goto("/post-game");
  await page.getByLabel("School Name").fill("Delete Test Academy");
  await page.getByLabel("Date & Time").fill("2030-10-10T19:00");
  await page.getByLabel("Accepting Bids Until").fill("2030-10-08T18:00");
  await page.getByLabel("Location").fill("50 Stadium Dr, Pittsburgh, PA");
  await page.getByLabel("Posted Pay (USD)").fill("155");
  await page.getByRole("button", { name: "Post Game" }).click();
  await expect(page.getByText("Game Posted")).toBeVisible();
  await dismissAlert(page);

  await page.goto("/schedule");
  await page
    .getByRole("button", { name: /Open details for Delete Test Academy/i })
    .click();
  await expect(page.getByRole("button", { name: "Delete Game" })).toBeVisible();

  await page.getByRole("button", { name: "Delete Game" }).click();
  await expect(page.getByRole("dialog", { name: "Delete Game" })).toBeVisible();
  await page
    .getByRole("dialog", { name: "Delete Game" })
    .getByRole("button", { name: "Delete Game" })
    .click({ force: true });

  await page.evaluate(() => {
    const controller = window.__OFFICIATING_E2E__;
    if (!controller) {
      throw new Error("E2E harness is not available.");
    }

    const nextState = controller.getState();
    const deletedGame = nextState.games.find(
      (game) => game.schoolName === "Delete Test Academy"
    );
    const deletedGameId = deletedGame?.id ?? null;
    nextState.games = nextState.games.filter(
      (game) => game.schoolName !== "Delete Test Academy"
    );
    if (deletedGameId) {
      nextState.bids = nextState.bids.filter((bid) => bid.gameId !== deletedGameId);
    }
    controller.replaceState(nextState);
  });
  await page.goto("/schedule");
  await expect(page.getByRole("heading", { name: "Schedule" })).toBeVisible();
  await expect(page.getByText("No posted games yet.")).toBeVisible();
  await expect(page.getByText("Delete Test Academy")).not.toBeVisible();

  await signOutFromProfile(page);

  await page.goto("/login");
  await signIn(page, "assignor@example.com");
  await seedAwardedGameWithExistingSubmissions(page);
  await page.goto("/schedule/games/game-1");

  const ratingsSection = page.locator(".details-card").filter({
    has: page.getByRole("heading", { name: "Post-Game Ratings" })
  });
  await expect(ratingsSection).toContainText("3/5");
  await ratingsSection.getByRole("button", { name: "Update" }).click();
  await selectOptionInRegion(page, ratingsSection.locator(".rating-edit-row"), "5");
  await ratingsSection.locator(".rating-edit-row textarea").fill(
    "Stronger follow-through after review."
  );
  await ratingsSection.getByRole("button", { name: "Save Rating" }).click();
  await expect(page.getByText("Rating Saved")).toBeVisible();
  await dismissAlert(page);
  await expect(
    ratingsSection.locator("tbody tr").filter({ hasText: "Olivia Official" }).first()
  ).toContainText("5/5");

  await signOutFromProfile(page);

  await page.goto("/login");
  await signIn(page, "evaluator@example.com");
  await page.goto("/schedule/games/game-1");

  await expect(page.getByRole("button", { name: "Update Evaluation" })).toBeVisible();
  await page.getByRole("button", { name: "Update Evaluation" }).click();
  const evaluationForm = page.locator("form.bid-form");
  await selectOptionInRegion(page, evaluationForm, "4 - Strong");
  await evaluationForm.getByLabel("Notes (Optional)").fill("Improved score after the initial review.");
  await evaluationForm.getByRole("button", { name: "Save Evaluation" }).click();
  await expect(page.getByText("Evaluation Saved")).toBeVisible();
  await dismissAlert(page);
  await expect(page.getByText("Latest submission: 4/5")).toBeVisible();
});

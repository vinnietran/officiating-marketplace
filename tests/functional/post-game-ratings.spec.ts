import { expect, test } from "@playwright/test";
import {
  dismissAlert,
  selectOption,
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
  await selectOption(page, page.locator("form"), "Crew Size Needed", "5 officials");
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
  await ratingGameCard.click();
  await page.getByRole("button", { name: "Place / Update Bid" }).click();
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
    const selectedBid = nextState.bids.find((candidate) => candidate.id === game?.selectedBidId);
    if (!game) {
      return;
    }

    nextState.crews.push({
      id: "crew-rating-1",
      name: "Riverside Crew",
      createdByUid: "official-1",
      createdByName: "Olivia Official",
      createdByRole: "official",
      createdAtISO: "2020-09-01T12:00:00.000Z",
      crewChiefUid: "official-1",
      crewChiefName: "Olivia Official",
      refereeOfficialId: "official-1",
      memberUids: ["official-1", "official-2"],
      members: [
        { uid: "official-1", name: "Olivia Official", email: "official1@example.com" },
        { uid: "official-2", name: "Noah Official", email: "official2@example.com" }
      ],
      memberPositions: {
        "official-1": "R",
        "official-2": "U"
      }
    });

    if (selectedBid) {
      selectedBid.bidderType = "crew";
      selectedBid.crewId = "crew-rating-1";
      selectedBid.baseCrewId = "crew-rating-1";
      selectedBid.crewName = "Riverside Crew";
    }

    game.dateISO = "2020-09-10T19:00:00.000Z";
    game.acceptingBidsUntilISO = "2020-09-08T18:00:00.000Z";
    game.awardedCrewId = "crew-rating-1";
    game.assignedOfficials = [
      {
        officialUid: "official-1",
        officialName: "Olivia Official",
        officialEmail: "official1@example.com",
        role: "R"
      }
    ];
    controller.replaceState(nextState);
  });
  await page.reload();

  const ratingsSection = page.locator(".details-card").filter({
    has: page.getByRole("heading", { name: "Post-Game Ratings" })
  });
  await ratingsSection.getByRole("button", { name: "Start Rating" }).click();
  const assignorRatingDialog = page.getByRole("dialog");
  await assignorRatingDialog.locator("textarea").fill("Strong communication and pacing.");
  await assignorRatingDialog.getByRole("button", { name: "Save Rating" }).click();
  await expect(page.getByText("Rating Saved")).toBeVisible();
  await dismissAlert(page);
  await assignorRatingDialog.getByRole("button", { name: "Close", exact: true }).click();
  await expect(
    ratingsSection.locator(".rating-target-card").filter({ hasText: "Riverside Crew" })
  ).toContainText("5/5 stars");
  await signOutFromProfile(page);

  await signIn(page, "official1@example.com");
  await page.goto("/schedule");
  await page.getByRole("button", { name: /Open details for Riverside Prep/i }).click();
  const officialRatingsSection = page.locator(".details-card").filter({
    has: page.getByRole("heading", { name: "Post-Game Ratings" })
  });
  await officialRatingsSection.getByRole("button", { name: "Start Rating" }).click();
  const officialRatingDialog = page.getByRole("dialog");
  await officialRatingDialog.getByRole("button", { name: /Riverside Prep/i }).click();
  await officialRatingDialog
    .locator(".rating-question-card")
    .filter({ hasText: "Did someone greet you upon arrival?" })
    .getByRole("button", { name: "Yes" })
    .click();
  await officialRatingDialog
    .locator(".rating-question-card")
    .filter({ hasText: "Satisfactory locker room?" })
    .getByRole("button", { name: "Yes" })
    .click();
  await officialRatingDialog
    .locator(".rating-question-card")
    .filter({ hasText: "Towels provided?" })
    .getByRole("button", { name: "No" })
    .click();
  await officialRatingDialog
    .locator(".rating-question-card")
    .filter({ hasText: "Food/Drink provided?" })
    .getByRole("button", { name: "Yes" })
    .click();
  await officialRatingDialog.getByRole("button", { name: "4 stars" }).click();
  await officialRatingDialog.locator("textarea").fill("Clear logistics and timely communication.");
  await officialRatingDialog.getByRole("button", { name: "Save Rating" }).click();
  await expect(page.getByText("Rating Saved")).toBeVisible();
  await dismissAlert(page);
  await officialRatingDialog.getByRole("button", { name: "Close", exact: true }).click();
  await expect(
    officialRatingsSection.locator(".rating-target-card").filter({ hasText: "Riverside Prep" })
  ).toContainText("4/5 stars");
});

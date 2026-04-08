import { expect, test } from "@playwright/test";
import {
  createCrew,
  dismissAlert,
  selectOption,
  selectOptionInRegion,
  signIn,
  signOutFromProfile,
  withScenario
} from "./helpers";

test("supports direct assignment workflows and evaluator submissions", async ({ page }) => {
  await page.goto(withScenario("/login"));

  await signIn(page, "official1@example.com");
  await createCrew(page, {
    crewName: "Direct Assign Crew",
    inviteEmail: "official2@example.com",
    creatorName: "Olivia Official",
    inviteeName: "Noah Official"
  });
  await signOutFromProfile(page);

  await signIn(page, "assignor@example.com");
  await page.goto("/assign-game");
  await page.getByLabel("School Name").fill("North Hills");
  await selectOption(page, page.locator("form"), "Crew Size Needed", "5 officials");
  await page.getByLabel("Date & Time").fill("2030-10-05T18:30");
  await page.getByLabel("Location").fill("500 North Ave, Pittsburgh, PA");
  await page.getByLabel("Game Fee (USD)").fill("180");
  await page.getByLabel("Notes (Optional)").fill("Direct staffing assignment.");

  const assignIndividualsSection = page.locator(".assign-section").filter({
    has: page.getByRole("heading", { name: "Assign Individuals" })
  });
  await assignIndividualsSection
    .getByPlaceholder("Search officials by name or email")
    .fill("Ava Official");
  await assignIndividualsSection
    .locator(".assign-match-item")
    .filter({ hasText: "Ava Official" })
    .getByRole("button", { name: "Assign" })
    .click();

  const assignCrewsSection = page.locator(".assign-section").filter({
    has: page.getByRole("heading", { name: "Assign Crews" })
  });
  await selectOptionInRegion(page, assignCrewsSection, "Direct Assign Crew (2 members)");
  await assignCrewsSection.getByRole("button", { name: "Add Crew" }).click();

  await page.getByRole("button", { name: "Assign Game" }).click();
  await expect(page.getByText("Game Assigned")).toBeVisible();
  await dismissAlert(page);
  await signOutFromProfile(page);

  await signIn(page, "official1@example.com");
  await page.goto("/schedule");
  await expect(page.getByText("North Hills")).toBeVisible();
  await signOutFromProfile(page);

  await page.evaluate(() => {
    const controller = window.__OFFICIATING_E2E__;
    if (!controller) {
      throw new Error("E2E harness is not available.");
    }

    const nextState = controller.getState();
    const game = nextState.games.find((candidate) => candidate.schoolName === "North Hills");
    if (!game) {
      throw new Error("North Hills game not found.");
    }

    game.dateISO = "2020-10-05T18:30:00.000Z";
    controller.replaceState(nextState);
  });

  await signIn(page, "evaluator@example.com");
  await page.goto("/schedule");
  await page.getByRole("button", { name: /Open details for North Hills/i }).click();
  const ratingsSection = page.locator(".details-card").filter({
    has: page.getByRole("heading", { name: "Post-Game Ratings" })
  });
  await ratingsSection.getByRole("button", { name: "Start Rating" }).click();
  const ratingDialog = page.getByRole("dialog");
  const crewTarget = ratingDialog.locator(".rating-studio-target").filter({
    hasText: "2 members"
  });
  await expect(crewTarget).toHaveCount(1);
  await expect(crewTarget).toBeVisible();
  await expect(ratingDialog.getByText("Olivia Official", { exact: true })).toBeVisible();
  await expect(ratingDialog.getByText("Noah Official", { exact: true })).toBeVisible();
  await crewTarget.click();
  await ratingDialog.getByRole("button", { name: "4 stars" }).click();
  await ratingDialog.locator("textarea").fill("Crew stayed organized throughout the assignment.");
  await ratingDialog.getByRole("button", { name: "Save Rating" }).click();
  await expect(page.getByText("Rating Saved")).toBeVisible();
  await dismissAlert(page);
  await ratingDialog.getByText("Olivia Official", { exact: true }).click();
  await ratingDialog.getByRole("button", { name: "5 stars" }).click();
  await ratingDialog
    .locator("textarea")
    .fill("Lead official managed communication and tempo well.");
  await ratingDialog.getByRole("button", { name: "Save Rating" }).click();
  await expect(page.getByText("Rating Saved")).toBeVisible();
  await dismissAlert(page);
  await ratingDialog.getByRole("button", { name: "Close", exact: true }).click();
  await expect(
    ratingsSection.locator(".rating-target-card").filter({ hasText: "2 members" })
  ).toContainText("4/5 stars");
  await expect(
    ratingsSection.locator(".rating-target-card").filter({ hasText: "Olivia Official" })
  ).toContainText("5/5 stars");

  await page.getByRole("button", { name: "Add Evaluation" }).click();
  await selectOptionInRegion(
    page,
    page.locator("form.bid-form"),
    "4 - Strong"
  );
  await page.getByLabel("Notes (Optional)").fill("Crew communication stayed on track.");
  await page.getByRole("button", { name: "Save Evaluation" }).click();
  await expect(page.getByText("Latest submission: 4/5")).toBeVisible();
});

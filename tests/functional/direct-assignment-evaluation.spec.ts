import { expect, test } from "@playwright/test";
import {
  createCrew,
  dismissAlert,
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

  await signIn(page, "evaluator@example.com");
  await page.goto("/schedule");
  await page.getByRole("button", { name: /Open details for North Hills/i }).click();
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

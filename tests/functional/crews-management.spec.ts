import { expect, test, type Page } from "@playwright/test";
import {
  createCrew,
  selectOption,
  setCrewMemberPosition,
  signIn,
  withScenario
} from "./helpers";

async function closeModalIfVisible(page: Page) {
  const dialog = page.getByRole("dialog");
  const isVisible = await dialog
    .waitFor({ state: "visible", timeout: 1000 })
    .then(() => true)
    .catch(() => false);

  if (!isVisible) {
    return;
  }

  await dialog
    .getByRole("button", { name: "OK" })
    .evaluate((button: HTMLButtonElement) => button.click());
  await expect(dialog).toBeHidden();
}

test("lets an official create, manage, and delete a crew", async ({ page }) => {
  await page.goto(withScenario("/login"));

  await signIn(page, "official1@example.com");
  await createCrew(page, {
    crewName: "Saturday Showcase Crew",
    inviteEmail: "official2@example.com",
    creatorName: "Olivia Official",
    inviteeName: "Noah Official"
  });
  await closeModalIfVisible(page);

  const crewTableRow = page.getByRole("button", {
    name: /Manage crew Saturday Showcase Crew/
  });
  await expect(crewTableRow).toBeVisible();
  await crewTableRow.click();

  const selectedCrewPanel = page
    .locator(".crew-card")
    .filter({ has: page.getByRole("heading", { name: /Manage Crew|View Crew/ }) })
    .last();

  await expect(selectedCrewPanel).toContainText("Name: Saturday Showcase Crew");
  await expect(selectedCrewPanel).toContainText("Crew Chief: Olivia Official");

  await selectedCrewPanel.getByLabel("Add Member by Email").fill("official3@example.com");
  await selectedCrewPanel.getByRole("button", { name: "Search" }).click();
  await selectedCrewPanel
    .locator(".crew-result-row")
    .filter({ hasText: "Ava Official" })
    .getByRole("button", { name: "Add" })
    .click();

  await expect(selectedCrewPanel).toContainText("Member added.");
  await expect(selectedCrewPanel.getByText("Ava Official")).toBeVisible();

  await setCrewMemberPosition(page, selectedCrewPanel, "Olivia Official", "Referee (R)");
  await setCrewMemberPosition(page, selectedCrewPanel, "Noah Official", "Umpire (U)");
  await setCrewMemberPosition(page, selectedCrewPanel, "Ava Official", "Center Judge (C)");
  await selectedCrewPanel.getByRole("button", { name: "Save Crew Positions" }).click();

  await expect(page.getByText("Crew Positions Updated")).toBeVisible();
  await closeModalIfVisible(page);

  await selectOption(page, selectedCrewPanel, "Crew Chief", "Noah Official");
  await selectedCrewPanel.getByRole("button", { name: "Save Crew Chief" }).click();
  await expect(selectedCrewPanel).toContainText("Crew chief updated.");
  await expect(selectedCrewPanel).toContainText("Crew Chief: Noah Official");

  await selectedCrewPanel.getByRole("button", { name: "Delete Crew" }).click();

  const deleteCrewDialog = page.getByRole("dialog");
  await expect(deleteCrewDialog.getByText("Delete this crew permanently?")).toBeVisible();
  await deleteCrewDialog
    .getByRole("button", { name: "Delete Crew" })
    .evaluate((button: HTMLButtonElement) => button.click());

  await expect(page.getByText("Crew Deleted")).toBeVisible();
  await closeModalIfVisible(page);

  await expect(
    page.getByRole("button", { name: /Manage crew Saturday Showcase Crew/ })
  ).toHaveCount(0);
  await expect(page.getByText("No crews yet.")).toBeVisible();
});

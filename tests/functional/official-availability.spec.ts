import { expect, test } from "@playwright/test";
import { signIn, signOutFromProfile, withScenario } from "./helpers";

test("officials can block dates and assignors see that availability when staffing games", async ({
  page
}) => {
  await page.goto(withScenario("/login"));

  await signIn(page, "official1@example.com");
  await page.goto("/availability");
  await expect(page.getByRole("heading", { level: 1, name: "Availability Calendar" })).toBeVisible();
  await page.getByRole("button", { name: "Block Apr 18, 2026" }).click();
  await page.getByRole("button", { name: "Save Availability" }).click();
  await expect(page.getByText("Availability saved.")).toBeVisible();
  await signOutFromProfile(page);

  await signIn(page, "assignor@example.com");
  await page.goto("/assign-game");
  await page.getByLabel("School Name").fill("North Hills");
  await page.getByLabel("Date & Time").fill("2026-04-18T18:30");
  await page.getByLabel("Location").fill("500 North Ave, Pittsburgh, PA");
  await page.getByLabel("Game Fee (USD)").fill("180");

  await page.getByRole("button", { name: "Browse Availability" }).click();
  const availabilityDialog = page.getByRole("dialog");
  await expect(availabilityDialog.getByRole("heading", { name: "Availability Finder" })).toBeVisible();
  const availabilityFilterGroup = availabilityDialog.locator(".assign-availability-filter-group");
  await availabilityFilterGroup.getByRole("button", { name: "Blocked" }).click();
  await expect(availabilityDialog.getByText("Olivia Official")).toBeVisible();
  await expect(availabilityDialog.getByText("Unavailable on Apr 18, 2026")).toBeVisible();
  await expect(availabilityDialog.getByText("Noah Official")).not.toBeVisible();
  await availabilityFilterGroup.getByRole("button", { name: "Available" }).click();
  await expect(availabilityDialog.getByText("Noah Official")).toBeVisible();
  await availabilityDialog
    .locator(".assign-availability-dialog-item")
    .filter({ hasText: "Noah Official" })
    .getByRole("button", { name: "Add to Roster" })
    .click();
  await expect(
    availabilityDialog
      .locator(".assign-availability-dialog-item")
      .filter({ hasText: "Noah Official" })
      .getByRole("button", { name: "Added" })
  ).toBeDisabled();
  await availabilityDialog.getByRole("button", { name: "Close availability finder" }).click();

  const assignIndividualsSection = page.locator(".assign-section").filter({
    has: page.getByRole("heading", { name: "Assign Individuals" })
  });
  await assignIndividualsSection.getByPlaceholder("Search officials by name").fill("Oli");
  await expect(assignIndividualsSection.getByText("No officials found")).toBeVisible();

  await assignIndividualsSection.getByPlaceholder("Search officials by name").fill("Noa");
  await expect(assignIndividualsSection.locator(".ui-searchable-select-item")).toHaveCount(0);
});

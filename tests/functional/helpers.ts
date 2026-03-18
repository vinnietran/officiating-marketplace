import { expect, type Locator, type Page } from "@playwright/test";

export const DEFAULT_PASSWORD = "Password123!";

export function withScenario(path: string, scenario: "blank" | "incomplete-profile" = "blank") {
  const separator = path.includes("?") ? "&" : "?";
  return `${path}${separator}e2eScenario=${scenario}`;
}

export async function signIn(
  page: Page,
  email: string,
  password: string = DEFAULT_PASSWORD
) {
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign In" }).click();
}

export async function dismissAlert(page: Page, buttonName: string = "OK") {
  const button = page.getByRole("button", { name: buttonName });
  if (await button.isVisible().catch(() => false)) {
    await button.click({ force: true });
    return;
  }

  const toastDismissButton = page.getByRole("button", { name: "Dismiss notification" });
  if (await toastDismissButton.isVisible().catch(() => false)) {
    await toastDismissButton.click({ force: true });
  }
}

export async function signOutFromProfile(page: Page) {
  await page.goto("/profile");
  await page.getByRole("button", { name: "Sign Out" }).click();
  await expect(page.getByRole("heading", { name: "Sign In" })).toBeVisible();
}

export async function selectOption(
  page: Page,
  container: Locator | Page,
  label: string,
  option: string
) {
  const trigger = container.locator(`label:has-text("${label}") [role="combobox"]`).first();
  await trigger.click();
  await page.getByRole("option", { name: option, exact: true }).click();
}

export async function selectOptionInRegion(
  page: Page,
  region: Locator,
  option: string
) {
  await region.locator('[role="combobox"]').first().click();
  await page.getByRole("option", { name: option, exact: true }).click();
}

export async function setCrewMemberPosition(
  page: Page,
  section: Locator,
  memberName: string,
  positionLabel: string
) {
  const memberRow = section.locator(".crew-member-item").filter({ hasText: memberName }).first();
  await selectOption(page, memberRow, "Position", positionLabel);
}

export async function createCrew(
  page: Page,
  options: {
    crewName: string;
    inviteEmail: string;
    creatorName: string;
    inviteeName: string;
  }
) {
  await page.goto("/crews");
  const createCrewSection = page.locator(".crew-card").filter({
    has: page.getByRole("heading", { name: "Create Crew" })
  });

  await createCrewSection.getByLabel("Crew Name").fill(options.crewName);
  await createCrewSection.getByLabel("Invite Official by Email").fill(options.inviteEmail);
  await createCrewSection.getByRole("button", { name: "Search" }).click();
  await createCrewSection
    .locator(".crew-result-row")
    .filter({ hasText: options.inviteeName })
    .getByRole("button", { name: "Invite" })
    .click();

  await setCrewMemberPosition(page, createCrewSection, options.creatorName, "Referee (R)");
  await setCrewMemberPosition(page, createCrewSection, options.inviteeName, "Umpire (U)");

  await createCrewSection.getByRole("button", { name: "Create Crew" }).click();
  await expect(page.getByText("Crew Created")).toBeVisible();
  await dismissAlert(page);
}

import { expect, test } from "@playwright/test";
import { selectOption, withScenario } from "./helpers";

test("completes onboarding for an authenticated user without a saved profile", async ({
  page
}) => {
  await page.goto(withScenario("/dashboard", "incomplete-profile"));

  await expect(page.getByRole("heading", { name: "Complete Your Profile" })).toBeVisible();
  await page.getByLabel("Display Name").fill("Pat Pending");
  await selectOption(page, page.locator("form"), "Role", "Official");
  await page.getByRole("button", { name: "Save Profile" }).click();

  await expect(page.getByRole("heading", { name: "Official Dashboard" })).toBeVisible();

  await page.goto("/profile");
  await expect(page.getByRole("heading", { name: "Profile" })).toBeVisible();
  await page.getByRole("checkbox", { name: "Varsity", exact: true }).check();
  await page.getByRole("checkbox", { name: "NCAA DI", exact: true }).check();
  await page.getByLabel("Address Line 1").fill("123 Main St");
  await page.getByLabel("City").fill("Pittsburgh");
  await page.getByLabel("State").fill("PA");
  await page.getByLabel("ZIP").fill("15222");
  await page.getByRole("button", { name: "Save Official Details" }).click();

  await expect(page.getByText("Official details saved.")).toBeVisible();
});

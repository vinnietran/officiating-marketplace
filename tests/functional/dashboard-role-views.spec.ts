import { expect, test, type Page } from "@playwright/test";
import { signIn, withScenario } from "./helpers";

async function seedDashboardState(page: Page) {
  await page.evaluate(() => {
    const controller = window.__OFFICIATING_E2E__;
    if (!controller) {
      throw new Error("Missing e2e controller.");
    }

    const state = controller.getState();
    const createdAtISO = "2030-08-01T12:00:00.000Z";

    state.games = [
      {
        id: "game-assignor-open",
        schoolName: "Pine-Richland",
        sport: "Football",
        level: "Varsity",
        dateISO: "2030-09-20T19:00:00.000Z",
        acceptingBidsUntilISO: "2030-09-18T18:00:00.000Z",
        location: "500 Pine Rd, Pittsburgh, PA",
        payPosted: 210,
        createdByUid: "assignor-1",
        createdByName: "Alex Assignor",
        createdByRole: "assignor",
        createdAtISO,
        status: "open",
        mode: "marketplace"
      },
      {
        id: "game-school-open",
        schoolName: "Westinghouse Academy",
        sport: "Basketball",
        level: "Junior Varsity",
        dateISO: "2030-09-22T18:30:00.000Z",
        acceptingBidsUntilISO: "2030-09-20T17:30:00.000Z",
        location: "700 School St, Pittsburgh, PA",
        payPosted: 145,
        createdByUid: "school-1",
        createdByName: "Sam School",
        createdByRole: "school",
        createdAtISO,
        status: "open",
        mode: "marketplace"
      },
      {
        id: "game-official-awarded",
        schoolName: "Mt. Lebanon",
        sport: "Soccer",
        level: "Middle School",
        dateISO: "2030-09-28T17:00:00.000Z",
        acceptingBidsUntilISO: "2030-09-25T16:00:00.000Z",
        location: "900 Cedar Blvd, Pittsburgh, PA",
        payPosted: 185,
        createdByUid: "assignor-1",
        createdByName: "Alex Assignor",
        createdByRole: "assignor",
        createdAtISO,
        status: "awarded",
        mode: "marketplace",
        selectedBidId: "bid-awarded-official1"
      }
    ];

    state.bids = [
      {
        id: "bid-open-official1",
        gameId: "game-assignor-open",
        officialUid: "official-1",
        officialName: "Olivia Official",
        bidderType: "individual",
        amount: 225,
        createdAtISO
      },
      {
        id: "bid-open-official2",
        gameId: "game-assignor-open",
        officialUid: "official-2",
        officialName: "Noah Official",
        bidderType: "individual",
        amount: 235,
        createdAtISO
      },
      {
        id: "bid-awarded-official1",
        gameId: "game-official-awarded",
        officialUid: "official-1",
        officialName: "Olivia Official",
        bidderType: "individual",
        amount: 230,
        createdAtISO
      }
    ];

    controller.replaceState(state);
  });
}

test("shows assignors the operations dashboard for their posted games", async ({ page }) => {
  await page.goto(withScenario("/login"));
  await seedDashboardState(page);

  await signIn(page, "assignor@example.com");
  await page.goto("/dashboard");

  const main = page.getByRole("main");
  await expect(main.getByRole("heading", { name: "Operations Dashboard" })).toBeVisible();
  await expect(main.getByRole("link", { name: "Post a Game" })).toBeVisible();
  await expect(main.getByRole("link", { name: "Assign Game" })).toBeVisible();

  const needsActionSection = page
    .locator(".dashboard-panel")
    .filter({ has: page.getByRole("heading", { name: "Needs Action" }) });
  await expect(needsActionSection).toContainText("Pine-Richland");
  await expect(needsActionSection).not.toContainText("Westinghouse Academy");
  await expect(needsActionSection).toContainText("$235");
});

test("shows schools the same operations dashboard, scoped to their own posted games", async ({
  page
}) => {
  await page.goto(withScenario("/login"));
  await seedDashboardState(page);

  await signIn(page, "school@example.com");
  await page.goto("/dashboard");

  await expect(page.getByRole("heading", { name: "Operations Dashboard" })).toBeVisible();

  const needsActionSection = page
    .locator(".dashboard-panel")
    .filter({ has: page.getByRole("heading", { name: "Needs Action" }) });
  await expect(needsActionSection).toContainText("Westinghouse Academy");
  await expect(needsActionSection).not.toContainText("Pine-Richland");
});

test("shows officials bid activity and awarded assignments on their dashboard", async ({
  page
}) => {
  await page.goto(withScenario("/login"));
  await seedDashboardState(page);

  await signIn(page, "official1@example.com");
  await page.goto("/dashboard");

  await expect(page.getByRole("heading", { name: "Official Dashboard" })).toBeVisible();

  const openBidActivity = page
    .locator(".dashboard-panel")
    .filter({ has: page.getByRole("heading", { name: "Open Bid Activity" }) });
  await expect(openBidActivity).toContainText("Pine-Richland");
  await expect(openBidActivity).toContainText("$225");
  await expect(openBidActivity).toContainText("$235");

  const upcomingAssignments = page
    .locator(".dashboard-panel")
    .filter({ has: page.getByRole("heading", { name: "Upcoming Assignments" }) });
  await expect(upcomingAssignments).toContainText("Mt. Lebanon");
  await expect(upcomingAssignments).toContainText("Individual");
  await expect(upcomingAssignments).toContainText("$230");
});

test("redirects evaluators from the dashboard to the schedule view", async ({ page }) => {
  await page.goto(withScenario("/login"));
  await seedDashboardState(page);

  await signIn(page, "evaluator@example.com");
  await page.goto("/dashboard");

  await expect(page).toHaveURL(/\/schedule$/);
  await expect(page.getByRole("heading", { name: "Schedule" })).toBeVisible();
});

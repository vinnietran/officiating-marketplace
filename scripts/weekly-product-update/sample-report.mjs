import { buildEmailSubject } from "./render.mjs";

export function createSampleReport() {
  const reportWindow = {
    start: new Date("2026-03-02T00:00:00.000Z"),
    end: new Date("2026-03-09T23:59:59.999Z"),
  };

  return {
    projectName: "Officiating Marketplace",
    reportWindow,
    generatedAt: "2026-03-10T14:30:00.000Z",
    subject: buildEmailSubject("Officiating Marketplace", reportWindow),
    branding: {
      companyName: "V&S Ventures LLC",
      email: "team@vs-venturesllc.com",
    },
    completedStories: [
      {
        number: 24,
        title: "Build game posting flow",
        url: "https://github.com/example/officiating-marketplace/issues/24",
        story:
          "Schools can create and publish open games that need to be filled by qualified officials.",
        completedOutcome:
          "School users can now create and publish a game posting visible in the marketplace.",
        validation: "Manually tested end-to-end in the development environment.",
      },
      {
        number: 31,
        title: "Improve crew assignment review",
        url: "https://github.com/example/officiating-marketplace/issues/31",
        story:
          "Assigners needed a clearer way to review crew availability before confirming game coverage.",
        completedOutcome:
          "Assigners can now review availability and finalize a crew assignment from one workflow.",
        validation: "Reviewed against the issue acceptance criteria and smoke tested locally.",
      },
    ],
    inProgressItems: [
      {
        title: "Refine profile completion prompts",
        url: "https://github.com/example/officiating-marketplace/issues/40",
        summary: "Improving the onboarding prompts so officials finish profiles with less back-and-forth.",
      },
      {
        title: "Messaging follow-up workflow",
        url: "https://github.com/example/officiating-marketplace/issues/43",
        summary: "Adding the next set of communication touchpoints after an assignment offer is sent.",
      },
    ],
    mergedPullRequests: [
      {
        number: 56,
        title: "Add marketplace publishing action",
        url: "https://github.com/example/officiating-marketplace/pull/56",
        mergedAt: "2026-03-06T19:10:00.000Z",
        author: "vs-ventures",
      },
    ],
    workflowStatus: {
      available: true,
      summary: "3 of 3 recent workflow runs passed on main.",
      runs: [
        {
          name: "CI",
          url: "https://github.com/example/officiating-marketplace/actions/runs/100",
          conclusion: "success",
          event: "push",
          updatedAt: "2026-03-09T18:05:00.000Z",
        },
        {
          name: "Deploy Preview",
          url: "https://github.com/example/officiating-marketplace/actions/runs/99",
          conclusion: "success",
          event: "pull_request",
          updatedAt: "2026-03-08T16:12:00.000Z",
        },
      ],
    },
    blockers: [
      {
        title: "Clarify preferred notification channel",
        url: "https://github.com/example/officiating-marketplace/issues/45",
        summary: "Need a product decision on whether SMS should be included in the first messaging release.",
      },
    ],
    nextFocus: [
      {
        title: "Marketplace bid acceptance",
        url: "https://github.com/example/officiating-marketplace/issues/48",
        summary: "Next planned focus is closing the loop from bidding to confirmed game assignment.",
      },
    ],
  };
}

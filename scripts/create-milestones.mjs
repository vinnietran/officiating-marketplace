#!/usr/bin/env node
/**
 * Creates project milestones in the GitHub repository.
 *
 * Usage:
 *   GITHUB_TOKEN=<token> GITHUB_REPOSITORY=owner/repo node scripts/create-milestones.mjs
 *
 * Environment variables:
 *   GITHUB_TOKEN       - GitHub personal access token or Actions token
 *   GITHUB_REPOSITORY  - Repository in "owner/repo" format
 *   GITHUB_API_URL     - Optional GitHub API base URL (defaults to https://api.github.com)
 */

const MILESTONES = [
  {
    title: "Post a game",
    description:
      "Features that allow officials assigners and coordinators to post new games to the marketplace, including game details, location, date, time, and officiating requirements.",
  },
  {
    title: "Assign a game",
    description:
      "Features that allow assigners to assign officials to posted games, manage assignments, and notify officials of their game assignments.",
  },
  {
    title: "Bid on a game",
    description:
      "Features that allow officials to browse available games and submit bids or expressions of interest to work specific games.",
  },
  {
    title: "Crew Management",
    description:
      "Features for managing officiating crews, including crew composition, roles, certifications, and crew history.",
  },
  {
    title: "Schedule Management",
    description:
      "Features for managing officiating schedules, viewing upcoming assignments, handling conflicts, and tracking availability.",
  },
  {
    title: "Game Day Operations",
    description:
      "Features supporting officials on game day, including check-in, incident reporting, and post-game documentation.",
  },
  {
    title: "Crew Communication and Planning",
    description:
      "Features enabling communication between crew members before and after games, including messaging, pre-game notes, and debrief tools.",
  },
];

const API_HEADERS = {
  Accept: "application/vnd.github+json",
  "X-GitHub-Api-Version": "2022-11-28",
  "Content-Type": "application/json",
};

async function createMilestone(apiBaseUrl, owner, repo, token, milestone) {
  const url = `${apiBaseUrl}/repos/${owner}/${repo}/milestones`;

  const response = await fetch(url, {
    method: "POST",
    headers: {
      ...API_HEADERS,
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      title: milestone.title,
      description: milestone.description,
      state: "open",
    }),
  });

  if (response.status === 422) {
    // Milestone may already exist; check for duplicate title error
    const body = await response.json();
    const alreadyExists =
      Array.isArray(body.errors) &&
      body.errors.some((e) => e.code === "already_exists");
    if (alreadyExists) {
      return { skipped: true, title: milestone.title };
    }
    throw new Error(
      `Failed to create milestone "${milestone.title}": ${response.status} ${JSON.stringify(body)}`
    );
  }

  if (!response.ok) {
    const body = await response.text();
    throw new Error(
      `Failed to create milestone "${milestone.title}": ${response.status} ${body}`
    );
  }

  const created = await response.json();
  return { skipped: false, title: created.title, number: created.number, url: created.html_url };
}

async function main() {
  const token = process.env.GITHUB_TOKEN;
  const repository = process.env.GITHUB_REPOSITORY;
  const apiBaseUrl = (process.env.GITHUB_API_URL ?? "https://api.github.com").replace(/\/+$/, "");

  if (!token) {
    console.error("Error: GITHUB_TOKEN environment variable is required.");
    process.exit(1);
  }

  if (!repository) {
    console.error("Error: GITHUB_REPOSITORY environment variable is required.");
    process.exit(1);
  }

  const [owner, repo] = repository.split("/");

  if (!owner || !repo) {
    console.error(`Error: GITHUB_REPOSITORY must be in "owner/repo" format. Got: ${repository}`);
    process.exit(1);
  }

  console.log(`Creating milestones for ${owner}/${repo}...\n`);

  let created = 0;
  let skipped = 0;
  let failed = 0;

  for (const milestone of MILESTONES) {
    try {
      const result = await createMilestone(apiBaseUrl, owner, repo, token, milestone);
      if (result.skipped) {
        console.log(`  ⚠  Skipped (already exists): ${milestone.title}`);
        skipped += 1;
      } else {
        console.log(`  ✓  Created milestone #${result.number}: ${result.title}`);
        console.log(`     ${result.url}`);
        created += 1;
      }
    } catch (err) {
      console.error(`  ✗  ${err.message}`);
      failed += 1;
    }
  }

  console.log(`\nDone. Created: ${created}, Skipped: ${skipped}, Failed: ${failed}`);

  if (failed > 0) {
    process.exit(1);
  }
}

main();

import fs from "node:fs/promises";
import path from "node:path";

import { loadConfig, validateRuntimeConfig } from "./config.mjs";
import {
  fetchClosedIssues,
  fetchMergedPullRequests,
  fetchOpenIssues,
  fetchRepository,
  fetchWorkflowStatus,
  selectIssuesByLabels,
} from "./github.mjs";
import { parseStoryDetails } from "./parser.mjs";
import {
  buildEmailSubject,
  renderConsoleSummary,
  renderEmailHtml,
  renderEmailText,
} from "./render.mjs";
import { sendEmail } from "./send-email.mjs";

function summarizeIssue(issue) {
  const details = parseStoryDetails(issue);
  return {
    title: issue.title,
    url: issue.html_url,
    summary: details.story,
  };
}

function summarizePullRequest(pullRequest) {
  return {
    number: pullRequest.number,
    title: pullRequest.title,
    url: pullRequest.html_url,
    mergedAt: pullRequest.merged_at,
    author: pullRequest.user?.login ?? "unknown",
  };
}

async function writeArtifacts(outputDir, report, html, text) {
  await fs.mkdir(outputDir, { recursive: true });

  const files = {
    "weekly-product-update.html": html,
    "weekly-product-update.txt": text,
    "weekly-product-update.json": JSON.stringify(report, null, 2),
  };

  await Promise.all(
    Object.entries(files).map(([fileName, contents]) =>
      fs.writeFile(path.join(outputDir, fileName), contents, "utf8"),
    ),
  );
}

async function main() {
  const config = loadConfig();
  validateRuntimeConfig(config);

  const repository = await fetchRepository(config);
  const openIssuesPromise = fetchOpenIssues(config);
  const closedIssuesPromise = fetchClosedIssues(config);
  const mergedPullRequestsPromise = config.featureFlags.includeMergedPRs
    ? fetchMergedPullRequests(config, repository.default_branch)
    : Promise.resolve([]);
  const workflowStatusPromise = config.featureFlags.includeTests
    ? fetchWorkflowStatus(config, repository.default_branch)
    : Promise.resolve({
        available: false,
        summary: "Test summary skipped by configuration.",
        runs: [],
      });

  const [openIssues, closedIssues, mergedPullRequests, workflowStatus] = await Promise.all([
    openIssuesPromise,
    closedIssuesPromise,
    mergedPullRequestsPromise,
    workflowStatusPromise,
  ]);

  const report = {
    projectName: config.projectName,
    reportWindow: config.reportWindow,
    generatedAt: new Date().toISOString(),
    subject: buildEmailSubject(config.projectName, config.reportWindow),
    completedStories: closedIssues.map(parseStoryDetails),
    inProgressItems: selectIssuesByLabels(openIssues, config.labels.inProgress).map(summarizeIssue),
    mergedPullRequests: mergedPullRequests.map(summarizePullRequest),
    workflowStatus,
    blockers: config.featureFlags.includeBlockers
      ? selectIssuesByLabels(openIssues, config.labels.blockers).map(summarizeIssue)
      : [],
    nextFocus: config.featureFlags.includeNextFocus
      ? selectIssuesByLabels(openIssues, config.labels.nextFocus).map(summarizeIssue)
      : [],
    repositoryUrl: `${config.serverUrl}/${config.repository}`,
  };

  const html = renderEmailHtml(report);
  const text = renderEmailText(report);

  await writeArtifacts(config.outputDir, report, html, text);

  console.log(renderConsoleSummary(report));

  if (config.dryRun) {
    console.log(`Dry run enabled. Preview artifacts written to ${config.outputDir}.`);
    return;
  }

  const result = await sendEmail({
    config,
    subject: report.subject,
    html,
    text,
  });

  console.log(`Email sent successfully (${result.messageId}).`);
}

main().catch((error) => {
  console.error(error.stack || error.message || error);
  process.exitCode = 1;
});


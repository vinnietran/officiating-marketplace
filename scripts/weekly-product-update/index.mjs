import fs from "node:fs/promises";
import path from "node:path";

import { loadConfig, validateRuntimeConfig } from "./config.mjs";
import {
  fetchClosedIssues,
  fetchOpenIssueProjectStatuses,
  fetchMergedPullRequests,
  fetchOpenIssues,
  fetchRepository,
  fetchWorkflowStatus,
  hasAnyProjectStatus,
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
    number: issue.number,
    title: issue.title,
    url: issue.html_url,
    summary: details.storyDetail || details.story,
  };
}

function selectInProgressIssues(issues, projectStatusesByIssueNumber, config) {
  return issues.filter((issue) => {
    if (selectIssuesByLabels([issue], config.labels.inProgress).length > 0) {
      return true;
    }

    const projectStatuses = projectStatusesByIssueNumber.get(issue.number) ?? [];
    return hasAnyProjectStatus(projectStatuses, config.statuses.inProgress);
  });
}

function buildInProgressDiagnostics(issues, projectStatusesByIssueNumber, config) {
  return issues.map((issue) => {
    const projectStatuses = projectStatusesByIssueNumber.get(issue.number) ?? [];
    const matchedByLabel = selectIssuesByLabels([issue], config.labels.inProgress).length > 0;
    const matchedByProjectStatus = hasAnyProjectStatus(
      projectStatuses,
      config.statuses.inProgress,
    );

    return {
      number: issue.number,
      title: issue.title,
      labels: (issue.labels ?? []).map((label) => label.name).filter(Boolean),
      projectStatuses,
      matchedByLabel,
      matchedByProjectStatus,
      includedInProgress: matchedByLabel || matchedByProjectStatus,
    };
  });
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

async function loadLogoAsset(config) {
  try {
    const logoBuffer = await fs.readFile(config.logoPath);
    const base64Content = logoBuffer.toString("base64");
    const fileName = path.basename(config.logoPath);

    return {
      previewSrc: `data:image/png;base64,${base64Content}`,
      emailSrc: "cid:weekly-product-update-logo",
      attachment: {
        content: base64Content,
        filename: fileName,
        type: "image/png",
        disposition: "inline",
        content_id: "weekly-product-update-logo",
      },
    };
  } catch {
    return {
      previewSrc: "",
      emailSrc: "",
      attachment: null,
    };
  }
}

async function main() {
  const config = loadConfig();
  validateRuntimeConfig(config);
  const logoAsset = await loadLogoAsset(config);

  const repository = await fetchRepository(config);
  const openIssuesPromise = fetchOpenIssues(config);
  const openIssueProjectStatusesPromise = fetchOpenIssueProjectStatuses(config)
    .then((map) => ({ map, warning: null }))
    .catch((error) => ({ map: new Map(), warning: error.message || String(error) }));
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

  const [
    openIssues,
    openIssueProjectStatusesResult,
    closedIssues,
    mergedPullRequests,
    workflowStatus,
  ] =
    await Promise.all([
      openIssuesPromise,
      openIssueProjectStatusesPromise,
      closedIssuesPromise,
      mergedPullRequestsPromise,
      workflowStatusPromise,
    ]);
  const openIssueProjectStatuses = openIssueProjectStatusesResult.map;
  const inProgressItems = selectInProgressIssues(
    openIssues,
    openIssueProjectStatuses,
    config,
  ).map(summarizeIssue);
  const inProgressDiagnostics = buildInProgressDiagnostics(
    openIssues,
    openIssueProjectStatuses,
    config,
  );

  const completedStories = closedIssues.map((issue) => ({
    ...parseStoryDetails(issue),
    completedAt: issue.closed_at || null,
  }));

  const report = {
    projectName: config.projectName,
    reportWindow: config.reportWindow,
    generatedAt: new Date().toISOString(),
    subject: buildEmailSubject(config.projectName, config.reportWindow),
    branding: {
      companyName: config.senderName || config.projectName,
      email: config.senderEmail,
    },
    completedStories,
    inProgressItems,
    mergedPullRequests: mergedPullRequests.map(summarizePullRequest),
    workflowStatus,
    blockers: config.featureFlags.includeBlockers
      ? selectIssuesByLabels(openIssues, config.labels.blockers).map(summarizeIssue)
      : [],
    nextFocus: config.featureFlags.includeNextFocus
      ? selectIssuesByLabels(openIssues, config.labels.nextFocus).map(summarizeIssue)
      : [],
    repositoryUrl: `${config.serverUrl}/${config.repository}`,
    diagnostics: {
      projectStatusWarning: openIssueProjectStatusesResult.warning,
      inProgressLabelsConfigured: config.labels.inProgress,
      inProgressStatusesConfigured: config.statuses.inProgress,
      openIssues: inProgressDiagnostics,
    },
  };

  const html = renderEmailHtml(report, { logoSrc: logoAsset.previewSrc });
  const text = renderEmailText(report);
  const emailHtml = renderEmailHtml(report, { logoSrc: logoAsset.emailSrc });

  await writeArtifacts(config.outputDir, report, html, text);

  console.log(renderConsoleSummary(report));
  if (openIssueProjectStatusesResult.warning) {
    console.warn(`Project status lookup warning: ${openIssueProjectStatusesResult.warning}`);
  }

  if (config.dryRun) {
    console.log(`Dry run enabled. Preview artifacts written to ${config.outputDir}.`);
    return;
  }

  const result = await sendEmail({
    config,
    subject: report.subject,
    html: emailHtml,
    text,
    attachments: logoAsset.attachment ? [logoAsset.attachment] : [],
  });

  console.log(`Email sent successfully (${result.messageId}).`);
}

main().catch((error) => {
  console.error(error.stack || error.message || error);
  process.exitCode = 1;
});

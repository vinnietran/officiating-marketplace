import path from "node:path";

const DAY_IN_MS = 24 * 60 * 60 * 1000;

function parseBoolean(value, fallback = false) {
  if (value === undefined || value === null || value === "") {
    return fallback;
  }

  const normalized = String(value).trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(normalized)) {
    return true;
  }

  if (["0", "false", "no", "off"].includes(normalized)) {
    return false;
  }

  return fallback;
}

function splitCsv(value) {
  if (!value) {
    return [];
  }

  return String(value)
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function humanizeRepositoryName(name) {
  return name
    .split(/[-_]/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function normalizeDateInput(value, boundary) {
  if (!value) {
    return null;
  }

  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const suffix = boundary === "start" ? "T00:00:00.000Z" : "T23:59:59.999Z";
    return new Date(`${value}${suffix}`);
  }

  return new Date(value);
}

function deriveReportWindow(startInput, endInput, now = new Date()) {
  const end = normalizeDateInput(endInput, "end") ?? now;
  const start =
    normalizeDateInput(startInput, "start") ?? new Date(end.getTime() - 7 * DAY_IN_MS);

  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    throw new Error("REPORT_START and REPORT_END must be valid ISO dates or YYYY-MM-DD.");
  }

  if (start > end) {
    throw new Error("REPORT_START must be earlier than or equal to REPORT_END.");
  }

  return { start, end };
}

export function loadConfig(env = process.env) {
  if (!env.GITHUB_REPOSITORY) {
    throw new Error("GITHUB_REPOSITORY is required.");
  }

  const [owner, repo] = env.GITHUB_REPOSITORY.split("/");
  const reportWindow = deriveReportWindow(env.REPORT_START, env.REPORT_END);
  const recipients = splitCsv(env.RECIPIENT_OVERRIDE || env.REPORT_RECIPIENTS);

  return {
    owner,
    repo,
    repository: env.GITHUB_REPOSITORY,
    apiBaseUrl: env.GITHUB_API_URL ?? "https://api.github.com",
    serverUrl: env.GITHUB_SERVER_URL ?? "https://github.com",
    githubToken: env.GITHUB_TOKEN,
    projectName: env.PROJECT_NAME || humanizeRepositoryName(repo),
    reportWindow,
    recipients,
    dryRun: parseBoolean(env.DRY_RUN, false),
    outputDir: path.resolve(env.REPORT_OUTPUT_DIR ?? "artifacts/weekly-product-update"),
    senderName: env.REPORT_SENDER_NAME || "Product Updates",
    senderEmail: env.REPORT_SENDER_EMAIL || "",
    sendgridApiKey: env.SENDGRID_API_KEY || "",
    logoPath: path.resolve(env.REPORT_LOGO_PATH ?? "vsventureslogo.png"),
    labels: {
      inProgress: splitCsv(env.IN_PROGRESS_LABELS || "in-progress,doing,active"),
      blockers: splitCsv(env.BLOCKER_LABELS || "blocked,blocker,question,open-question"),
      nextFocus: splitCsv(env.NEXT_FOCUS_LABELS || "next-up"),
    },
    featureFlags: {
      includeMergedPRs: parseBoolean(env.INCLUDE_MERGED_PRS, true),
      includeTests: parseBoolean(env.INCLUDE_TESTS, true),
      includeBlockers: parseBoolean(env.INCLUDE_BLOCKERS, true),
      includeNextFocus: parseBoolean(env.INCLUDE_NEXT_FOCUS, true),
    },
  };
}

export function validateRuntimeConfig(config) {
  if (!config.githubToken) {
    throw new Error("GITHUB_TOKEN is required to read GitHub issues, pull requests, and workflow runs.");
  }

  if (config.dryRun) {
    return;
  }

  if (!config.recipients.length) {
    throw new Error("REPORT_RECIPIENTS or RECIPIENT_OVERRIDE must be provided when dry-run is disabled.");
  }

  if (!config.senderEmail) {
    throw new Error("REPORT_SENDER_EMAIL must be configured when dry-run is disabled.");
  }

  if (!config.sendgridApiKey) {
    throw new Error("SENDGRID_API_KEY must be configured when dry-run is disabled.");
  }
}

const API_HEADERS = {
  Accept: "application/vnd.github+json",
  "X-GitHub-Api-Version": "2022-11-28",
};

function buildUrl(config, pathname, params = {}) {
  const url = new URL(pathname, config.apiBaseUrl);

  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== "") {
      url.searchParams.set(key, String(value));
    }
  }

  return url;
}

async function githubRequest(config, pathname, params = {}) {
  const response = await fetch(buildUrl(config, pathname, params), {
    headers: {
      ...API_HEADERS,
      Authorization: `Bearer ${config.githubToken}`,
    },
  });

  if (!response.ok) {
    throw new Error(`GitHub API request failed (${response.status}) for ${pathname}.`);
  }

  return response.json();
}

async function githubGraphqlRequest(config, query, variables = {}) {
  const response = await fetch(config.graphqlUrl, {
    method: "POST",
    headers: {
      ...API_HEADERS,
      Authorization: `Bearer ${config.githubToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ query, variables }),
  });

  if (!response.ok) {
    throw new Error(`GitHub GraphQL request failed (${response.status}).`);
  }

  const payload = await response.json();
  if (payload.errors?.length) {
    throw new Error(payload.errors.map((error) => error.message).join("; "));
  }

  return payload.data;
}

async function paginate(config, pathname, params = {}) {
  const items = [];
  let page = 1;

  while (true) {
    const pageItems = await githubRequest(config, pathname, {
      ...params,
      per_page: 100,
      page,
    });

    if (!Array.isArray(pageItems)) {
      throw new Error(`Expected an array from ${pathname}.`);
    }

    items.push(...pageItems);

    if (pageItems.length < 100) {
      break;
    }

    page += 1;
  }

  return items;
}

export function isPullRequestIssue(item) {
  return Boolean(item?.pull_request);
}

export function filterOutPullRequests(items = []) {
  return items.filter((item) => !isPullRequestIssue(item));
}

function normalizeLabelName(value) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function hasAnyLabel(issue, labelNames = []) {
  const labels = new Set((issue.labels ?? []).map((label) => normalizeLabelName(label.name)));
  return labelNames.some((name) => labels.has(normalizeLabelName(name)));
}

export function hasAnyProjectStatus(statuses = [], trackedNames = []) {
  const normalizedStatuses = new Set(statuses.map((status) => normalizeLabelName(status)));
  return trackedNames.some((name) => normalizedStatuses.has(normalizeLabelName(name)));
}

export function isWithinReportWindow(dateValue, reportWindow) {
  if (!dateValue) {
    return false;
  }

  const timestamp = new Date(dateValue).getTime();
  return timestamp >= reportWindow.start.getTime() && timestamp <= reportWindow.end.getTime();
}

function sortByDateDescending(items, fieldName) {
  return [...items].sort((left, right) => new Date(right[fieldName]) - new Date(left[fieldName]));
}

export async function fetchRepository(config) {
  return githubRequest(config, `/repos/${config.owner}/${config.repo}`);
}

export async function fetchClosedIssues(config) {
  const issues = await paginate(config, `/repos/${config.owner}/${config.repo}/issues`, {
    state: "closed",
    sort: "updated",
    direction: "desc",
    since: config.reportWindow.start.toISOString(),
  });

  return sortByDateDescending(
    filterOutPullRequests(issues).filter((issue) =>
      isWithinReportWindow(issue.closed_at, config.reportWindow),
    ),
    "closed_at",
  );
}

export async function fetchOpenIssues(config) {
  const issues = await paginate(config, `/repos/${config.owner}/${config.repo}/issues`, {
    state: "open",
    sort: "updated",
    direction: "desc",
  });

  return filterOutPullRequests(issues);
}

const OPEN_ISSUE_PROJECT_STATUSES_QUERY = `
  query OpenIssueProjectStatuses($owner: String!, $repo: String!, $after: String) {
    repository(owner: $owner, name: $repo) {
      issues(first: 100, states: OPEN, after: $after, orderBy: { field: UPDATED_AT, direction: DESC }) {
        pageInfo {
          hasNextPage
          endCursor
        }
        nodes {
          number
          projectItems(first: 20, includeArchived: false) {
            nodes {
              fieldValueByName(name: "Status") {
                ... on ProjectV2ItemFieldSingleSelectValue {
                  name
                }
              }
            }
          }
        }
      }
    }
  }
`;

export async function fetchOpenIssueProjectStatuses(config) {
  const statusesByIssueNumber = new Map();
  let after = null;

  while (true) {
    const data = await githubGraphqlRequest(config, OPEN_ISSUE_PROJECT_STATUSES_QUERY, {
      owner: config.owner,
      repo: config.repo,
      after,
    });

    const issuesConnection = data?.repository?.issues;
    const nodes = issuesConnection?.nodes ?? [];

    for (const issue of nodes) {
      const statuses = (issue.projectItems?.nodes ?? [])
        .map((item) => item?.fieldValueByName?.name)
        .filter(Boolean);
      statusesByIssueNumber.set(issue.number, statuses);
    }

    if (!issuesConnection?.pageInfo?.hasNextPage) {
      break;
    }

    after = issuesConnection.pageInfo.endCursor;
  }

  return statusesByIssueNumber;
}

export function selectIssuesByLabels(issues, labelNames = []) {
  return issues.filter((issue) => hasAnyLabel(issue, labelNames));
}

export async function fetchMergedPullRequests(config, defaultBranch) {
  const pullRequests = await paginate(config, `/repos/${config.owner}/${config.repo}/pulls`, {
    state: "closed",
    base: defaultBranch,
    sort: "updated",
    direction: "desc",
  });

  return sortByDateDescending(
    pullRequests.filter((pullRequest) =>
      isWithinReportWindow(pullRequest.merged_at, config.reportWindow),
    ),
    "merged_at",
  );
}

function normalizeWorkflowRun(run) {
  return {
    name: run.name,
    url: run.html_url,
    conclusion: run.conclusion,
    event: run.event,
    updatedAt: run.updated_at,
  };
}

export async function fetchWorkflowStatus(config, defaultBranch) {
  const response = await githubRequest(
    config,
    `/repos/${config.owner}/${config.repo}/actions/runs`,
    {
      branch: defaultBranch,
      status: "completed",
      per_page: 20,
    },
  );

  const runs = (response.workflow_runs ?? [])
    .filter((run) => !String(run.path ?? "").endsWith("weekly-product-update.yml"))
    .slice(0, 5)
    .map(normalizeWorkflowRun);

  if (!runs.length) {
    return {
      available: false,
      summary: "Test summary unavailable.",
      runs: [],
    };
  }

  const successCount = runs.filter((run) => run.conclusion === "success").length;

  return {
    available: true,
    summary: `${successCount} of ${runs.length} recent workflow runs passed on ${defaultBranch}.`,
    latest: runs[0],
    runs,
  };
}

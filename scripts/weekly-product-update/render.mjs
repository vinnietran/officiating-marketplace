function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function formatDisplayDate(value) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "2-digit",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(value));
}

function formatRelativeTimestamp(value) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "UTC",
  }).format(new Date(value));
}

function renderStoryCard(story) {
  return `
    <div class="card">
      <h3>Issue #${escapeHtml(story.number)} - ${escapeHtml(story.title)}</h3>
      <p><strong>Story:</strong> ${escapeHtml(story.story)}</p>
      <p><strong>Completed Outcome:</strong> ${escapeHtml(story.completedOutcome)}</p>
      <p><strong>Validation:</strong> ${escapeHtml(story.validation)}</p>
      <p class="meta"><a href="${escapeHtml(story.url)}">View issue</a></p>
    </div>
  `;
}

function renderIssueList(items, emptyState) {
  if (!items.length) {
    return `<p>${escapeHtml(emptyState)}</p>`;
  }

  const listItems = items
    .map(
      (item) => `
        <li>
          <a href="${escapeHtml(item.url)}">${escapeHtml(item.title)}</a>
          <div class="list-detail">${escapeHtml(item.summary)}</div>
        </li>
      `,
    )
    .join("");

  return `<ul>${listItems}</ul>`;
}

function renderWorkflowStatus(workflowStatus) {
  if (!workflowStatus.available) {
    return `<p>${escapeHtml(workflowStatus.summary)}</p>`;
  }

  const items = workflowStatus.runs
    .map(
      (run) => `
        <li>
          <a href="${escapeHtml(run.url)}">${escapeHtml(run.name)}</a>
          <span class="pill ${escapeHtml(run.conclusion)}">${escapeHtml(run.conclusion)}</span>
          <div class="list-detail">Updated ${escapeHtml(formatRelativeTimestamp(run.updatedAt))} UTC via ${escapeHtml(run.event)}.</div>
        </li>
      `,
    )
    .join("");

  return `
    <p>${escapeHtml(workflowStatus.summary)}</p>
    <ul>${items}</ul>
  `;
}

function renderPullRequests(pullRequests) {
  if (!pullRequests.length) {
    return "";
  }

  const items = pullRequests
    .map(
      (pullRequest) => `
        <li>
          <a href="${escapeHtml(pullRequest.url)}">PR #${escapeHtml(pullRequest.number)} - ${escapeHtml(pullRequest.title)}</a>
          <div class="list-detail">Merged ${escapeHtml(formatDisplayDate(pullRequest.mergedAt))} by ${escapeHtml(pullRequest.author)}.</div>
        </li>
      `,
    )
    .join("");

  return `
    <section>
      <h2>Optional Merged PRs</h2>
      <ul>${items}</ul>
    </section>
  `;
}

function renderOptionalSection(title, items) {
  if (!items.length) {
    return "";
  }

  return `
    <section>
      <h2>${escapeHtml(title)}</h2>
      ${renderIssueList(items, "")}
    </section>
  `;
}

export function formatDateRangeLabel(reportWindow) {
  return `${formatDisplayDate(reportWindow.start)} to ${formatDisplayDate(reportWindow.end)}`;
}

export function buildEmailSubject(projectName, reportWindow) {
  return `Weekly Product Update - ${projectName} - ${formatDateRangeLabel(reportWindow)}`;
}

export function renderEmailHtml(report) {
  const completedSection = report.completedStories.length
    ? report.completedStories.map(renderStoryCard).join("")
    : "<p>No completed stories this period.</p>";

  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${escapeHtml(report.subject)}</title>
    <style>
      body { background: #f3f5f8; color: #172033; font-family: "Helvetica Neue", Helvetica, Arial, sans-serif; margin: 0; padding: 24px; }
      .email { background: #ffffff; border: 1px solid #d8dee8; border-radius: 16px; margin: 0 auto; max-width: 760px; padding: 32px; }
      h1, h2, h3 { color: #11213c; margin-top: 0; }
      h1 { font-size: 28px; margin-bottom: 8px; }
      h2 { border-top: 1px solid #e6ebf2; font-size: 18px; margin-top: 28px; padding-top: 24px; }
      h3 { font-size: 17px; margin-bottom: 12px; }
      p, li { font-size: 15px; line-height: 1.55; }
      .lede { color: #516179; margin-bottom: 24px; }
      .metrics { display: flex; flex-wrap: wrap; gap: 12px; margin: 20px 0 8px; }
      .metric { background: #eef3f8; border-radius: 12px; min-width: 130px; padding: 14px 16px; }
      .metric-label { color: #5d6b81; display: block; font-size: 12px; letter-spacing: 0.04em; text-transform: uppercase; }
      .metric-value { color: #11213c; display: block; font-size: 24px; font-weight: 700; margin-top: 4px; }
      .card { border: 1px solid #e1e6ee; border-radius: 14px; margin-bottom: 16px; padding: 18px 18px 6px; }
      ul { margin: 0; padding-left: 20px; }
      li { margin-bottom: 12px; }
      .list-detail, .meta { color: #5d6b81; font-size: 14px; margin-top: 4px; }
      a { color: #0b57d0; text-decoration: none; }
      .pill { border-radius: 999px; display: inline-block; font-size: 12px; font-weight: 700; margin-left: 8px; padding: 2px 8px; text-transform: uppercase; }
      .success { background: #daf5e4; color: #166534; }
      .failure, .timed_out, .cancelled, .action_required, .startup_failure, .stale { background: #fde2e2; color: #9f1239; }
      @media (max-width: 640px) { body { padding: 12px; } .email { padding: 20px; } }
    </style>
  </head>
  <body>
    <div class="email">
      <h1>${escapeHtml(report.subject)}</h1>
      <p class="lede">Reporting period: ${escapeHtml(formatDateRangeLabel(report.reportWindow))}. Generated ${escapeHtml(formatRelativeTimestamp(report.generatedAt))} UTC.</p>

      <div class="metrics">
        <div class="metric">
          <span class="metric-label">Completed Stories</span>
          <span class="metric-value">${escapeHtml(report.completedStories.length)}</span>
        </div>
        <div class="metric">
          <span class="metric-label">In Progress</span>
          <span class="metric-value">${escapeHtml(report.inProgressItems.length)}</span>
        </div>
        <div class="metric">
          <span class="metric-label">Merged PRs</span>
          <span class="metric-value">${escapeHtml(report.mergedPullRequests.length)}</span>
        </div>
      </div>

      <section>
        <h2>Completed Stories</h2>
        ${completedSection}
      </section>

      <section>
        <h2>In-Progress Work</h2>
        ${renderIssueList(report.inProgressItems, "No in-progress work is currently tagged with the configured labels.")}
      </section>

      <section>
        <h2>Recent Test/Build Summary</h2>
        ${renderWorkflowStatus(report.workflowStatus)}
      </section>

      ${renderPullRequests(report.mergedPullRequests)}
      ${renderOptionalSection("Optional Blockers / Questions", report.blockers)}
      ${renderOptionalSection("Optional Next Focus", report.nextFocus)}
    </div>
  </body>
</html>`;
}

export function renderEmailText(report) {
  const lines = [
    report.subject,
    `Reporting period: ${formatDateRangeLabel(report.reportWindow)}`,
    "",
    "Completed stories:",
  ];

  if (!report.completedStories.length) {
    lines.push("- No completed stories this period.");
  } else {
    for (const story of report.completedStories) {
      lines.push(`- Issue #${story.number} - ${story.title}`);
      lines.push(`  Story: ${story.story}`);
      lines.push(`  Completed Outcome: ${story.completedOutcome}`);
      lines.push(`  Validation: ${story.validation}`);
      lines.push(`  Link: ${story.url}`);
    }
  }

  lines.push("", "In-progress work:");
  if (!report.inProgressItems.length) {
    lines.push("- No in-progress work is currently tagged with the configured labels.");
  } else {
    for (const item of report.inProgressItems) {
      lines.push(`- ${item.title}: ${item.summary}`);
    }
  }

  lines.push("", "Recent test/build summary:");
  lines.push(`- ${report.workflowStatus.summary}`);

  if (report.mergedPullRequests.length) {
    lines.push("", "Merged PRs:");
    for (const pullRequest of report.mergedPullRequests) {
      lines.push(`- PR #${pullRequest.number} - ${pullRequest.title}`);
    }
  }

  if (report.blockers.length) {
    lines.push("", "Blockers / questions:");
    for (const blocker of report.blockers) {
      lines.push(`- ${blocker.title}: ${blocker.summary}`);
    }
  }

  if (report.nextFocus.length) {
    lines.push("", "Next focus:");
    for (const item of report.nextFocus) {
      lines.push(`- ${item.title}: ${item.summary}`);
    }
  }

  return lines.join("\n");
}

export function renderConsoleSummary(report) {
  return [
    `Subject: ${report.subject}`,
    `Completed stories: ${report.completedStories.length}`,
    `In-progress items: ${report.inProgressItems.length}`,
    `Merged PRs: ${report.mergedPullRequests.length}`,
    `Workflow summary: ${report.workflowStatus.summary}`,
  ].join("\n");
}


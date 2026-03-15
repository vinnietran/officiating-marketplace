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

function formatLongDisplayDate(value) {
  return new Intl.DateTimeFormat("en-US", {
    month: "long",
    day: "numeric",
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

function buildReportId(generatedAt) {
  const date = new Date(generatedAt);
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  return `${year}-${month}${day}`;
}

function renderLogo(logoSrc, companyName) {
  if (!logoSrc) {
    return `<div class="brand-mark-fallback">${escapeHtml(companyName.slice(0, 2).toUpperCase())}</div>`;
  }

  return `<img class="brand-mark" src="${escapeHtml(logoSrc)}" alt="${escapeHtml(companyName)} logo" />`;
}

function renderMultilineText(value) {
  return escapeHtml(value).replace(/\n\n+/g, "</p><p>").replace(/\n/g, "<br />");
}

function renderStoryCard(story) {
  return `
    <article class="story-card">
      <h3>${escapeHtml(story.title)}</h3>
      <p>${renderMultilineText(story.storyDetail || story.story)}</p>
      <div class="story-dates">
        <span><strong>Marked done:</strong> ${
          story.completedAt ? escapeHtml(formatLongDisplayDate(story.completedAt)) : "Not tracked"
        }</span>
      </div>
    </article>
  `;
}

function renderSummaryList(items, emptyState) {
  if (!items.length) {
    return `<p class="empty-copy">${escapeHtml(emptyState)}</p>`;
  }

  return items
    .map(
      (item) => `
        <article class="summary-item">
          <h3>${escapeHtml(item.title)}</h3>
          <p>${escapeHtml(item.summary)}</p>
        </article>
      `,
    )
    .join("");
}

function renderWorkflowStatus(workflowStatus) {
  if (!workflowStatus.available) {
    return `<p class="empty-copy">${escapeHtml(workflowStatus.summary)}</p>`;
  }

  const runs = workflowStatus.runs
    .map(
      (run) => `
        <div class="quality-row">
          <div>
            <strong>${escapeHtml(run.name)}</strong>
            <div class="quality-meta">Updated ${escapeHtml(formatRelativeTimestamp(run.updatedAt))} UTC</div>
          </div>
          <span class="status-pill status-${escapeHtml(run.conclusion)}">${escapeHtml(run.conclusion)}</span>
        </div>
      `,
    )
    .join("");

  return `
    <p class="quality-summary">${escapeHtml(workflowStatus.summary)}</p>
    <div class="quality-list">${runs}</div>
  `;
}

function renderOptionalSection(title, items, emptyState = "") {
  if (!items.length && !emptyState) {
    return "";
  }

  return `
    <section class="content-section">
      <h2>${escapeHtml(title)}</h2>
      <div class="stack">
        ${renderSummaryList(items, emptyState)}
      </div>
    </section>
  `;
}

export function formatDateRangeLabel(reportWindow) {
  return `${formatDisplayDate(reportWindow.start)} to ${formatDisplayDate(reportWindow.end)}`;
}

export function buildEmailSubject(projectName, reportWindow) {
  return `Weekly Product Update - ${projectName} - ${formatDateRangeLabel(reportWindow)}`;
}

export function renderEmailHtml(report, options = {}) {
  const companyName = report.branding?.companyName || report.projectName;
  const logoSrc = options.logoSrc || "";
  const completedSection = report.completedStories.length
    ? report.completedStories.map(renderStoryCard).join("")
    : `<p class="empty-copy">No completed milestones were finalized in this reporting period.</p>`;

  const latestQualityState = report.workflowStatus.available
    ? report.workflowStatus.runs[0]?.conclusion || "tracked"
    : "tracked";

  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${escapeHtml(report.subject)}</title>
    <style>
      body {
        margin: 0;
        padding: 24px;
        background: #f5f7fb;
        color: #13233f;
        font-family: "Helvetica Neue", Helvetica, Arial, sans-serif;
      }
      .email-shell {
        max-width: 980px;
        margin: 0 auto;
        background: #ffffff;
        border-radius: 24px;
        overflow: hidden;
        box-shadow: 0 18px 48px rgba(15, 23, 42, 0.14);
      }
      .hero {
        background: radial-gradient(circle at 35% 35%, #173d78 0%, #102d5d 38%, #0b1730 100%);
        color: #f8fbff;
        padding: 40px 48px 44px;
      }
      .hero-grid {
        width: 100%;
        border-collapse: collapse;
      }
      .hero-grid td {
        vertical-align: top;
      }
      .brand-wrap {
        padding-right: 24px;
      }
      .brand-row {
        width: 100%;
        border-collapse: collapse;
      }
      .brand-mark-cell {
        width: 132px;
        padding-right: 24px;
      }
      .brand-mark,
      .brand-mark-fallback {
        width: 108px;
        height: 108px;
        display: block;
        border-radius: 20px;
        background: #0d203e;
        object-fit: contain;
      }
      .brand-mark-fallback {
        color: #ffbf30;
        font-size: 34px;
        font-weight: 800;
        line-height: 108px;
        text-align: center;
      }
      .brand-name {
        margin: 0;
        font-size: 28px;
        line-height: 1.1;
        font-weight: 700;
        color: #ffffff;
      }
      .brand-project {
        margin: 10px 0 0;
        font-size: 17px;
        color: rgba(255, 255, 255, 0.84);
      }
      .brand-contact {
        margin: 8px 0 0;
        font-size: 15px;
        color: rgba(255, 255, 255, 0.84);
      }
      .meta-panel {
        min-width: 230px;
        padding-top: 12px;
      }
      .meta-label {
        display: block;
        font-size: 13px;
        letter-spacing: 0.16em;
        text-transform: uppercase;
        color: rgba(255, 255, 255, 0.72);
        margin-bottom: 8px;
      }
      .meta-value {
        display: block;
        font-size: 19px;
        font-weight: 700;
        color: #ffffff;
        margin-bottom: 26px;
      }
      .content {
        padding: 32px 40px 40px;
      }
      .overview {
        background: #f6f9ff;
        border: 1px solid #dfe8f7;
        border-radius: 20px;
        padding: 22px 24px;
        margin-bottom: 28px;
      }
      .overview h2 {
        margin: 0 0 8px;
        font-size: 22px;
        color: #10233e;
      }
      .overview p {
        margin: 0;
        font-size: 15px;
        line-height: 1.6;
        color: #50627f;
      }
      .metrics {
        width: 100%;
        border-collapse: separate;
        border-spacing: 12px 0;
        margin: 18px -12px 0;
      }
      .metric-card {
        background: #ffffff;
        border: 1px solid #dfe6f2;
        border-radius: 16px;
        padding: 18px;
      }
      .metric-label {
        display: block;
        font-size: 12px;
        letter-spacing: 0.08em;
        text-transform: uppercase;
        color: #5f7090;
      }
      .metric-value {
        display: block;
        margin-top: 6px;
        font-size: 28px;
        line-height: 1;
        font-weight: 700;
        color: #10233e;
      }
      .content-section {
        margin-top: 28px;
      }
      .content-section h2 {
        margin: 0 0 16px;
        font-size: 20px;
        color: #10233e;
      }
      .stack {
        display: block;
      }
      .story-card,
      .summary-item,
      .quality-list {
        background: #ffffff;
        border: 1px solid #e2e8f2;
        border-radius: 18px;
      }
      .story-card,
      .summary-item {
        padding: 18px 20px;
        margin-bottom: 14px;
      }
      .story-card h3,
      .summary-item h3 {
        margin: 0 0 10px;
        font-size: 17px;
        color: #122543;
      }
      .story-card p,
      .summary-item p,
      .quality-summary,
      .empty-copy {
        margin: 0;
        font-size: 15px;
        line-height: 1.65;
        color: #4e5f79;
      }
      .story-card p + p,
      .summary-item p + p {
        margin-top: 8px;
      }
      .story-dates {
        margin-top: 14px;
        display: grid;
        gap: 6px;
        font-size: 14px;
        color: #5f7090;
      }
      .quality-summary {
        margin-bottom: 12px;
      }
      .quality-row {
        display: table;
        width: 100%;
        box-sizing: border-box;
        padding: 16px 18px;
        border-top: 1px solid #e2e8f2;
      }
      .quality-row:first-child {
        border-top: 0;
      }
      .quality-row > div,
      .quality-row > span {
        display: table-cell;
        vertical-align: middle;
      }
      .quality-row > span {
        text-align: right;
      }
      .quality-meta {
        margin-top: 4px;
        font-size: 13px;
        color: #6b7c95;
      }
      .status-pill {
        display: inline-block;
        padding: 6px 12px;
        border-radius: 999px;
        font-size: 12px;
        font-weight: 700;
        letter-spacing: 0.06em;
        text-transform: uppercase;
      }
      .status-success {
        background: #dbf5e6;
        color: #17633c;
      }
      .status-failure,
      .status-timed_out,
      .status-cancelled,
      .status-action_required,
      .status-startup_failure,
      .status-stale {
        background: #fde4e6;
        color: #9f1f39;
      }
      @media (max-width: 760px) {
        body {
          padding: 12px;
        }
        .hero,
        .content {
          padding: 24px 20px;
        }
        .hero-grid,
        .hero-grid tbody,
        .hero-grid tr,
        .hero-grid td,
        .brand-row,
        .brand-row tbody,
        .brand-row tr,
        .brand-row td,
        .metrics,
        .metrics tbody,
        .metrics tr,
        .metrics td {
          display: block;
          width: 100%;
        }
        .brand-mark-cell,
        .brand-wrap {
          padding-right: 0;
        }
        .brand-mark,
        .brand-mark-fallback {
          margin-bottom: 18px;
        }
        .meta-panel {
          margin-top: 24px;
        }
        .metrics {
          margin: 18px 0 0;
        }
        .metric-card {
          margin-bottom: 12px;
        }
        .quality-row,
        .quality-row > div,
        .quality-row > span {
          display: block;
          text-align: left;
        }
        .quality-row > span {
          margin-top: 12px;
        }
      }
    </style>
  </head>
  <body>
    <div class="email-shell">
      <div class="hero">
        <table class="hero-grid" role="presentation">
          <tr>
            <td class="brand-wrap">
              <table class="brand-row" role="presentation">
                <tr>
                  <td class="brand-mark-cell">${renderLogo(logoSrc, companyName)}</td>
                  <td>
                    <h1 class="brand-name">${escapeHtml(companyName)}</h1>
                    <p class="brand-project">${escapeHtml(report.projectName)} weekly product update</p>
                  </td>
                </tr>
              </table>
            </td>
            <td class="meta-panel">
              <span class="meta-label">Report</span>
              <span class="meta-value">#${escapeHtml(buildReportId(report.generatedAt))}</span>
              <span class="meta-label">Report Date</span>
              <span class="meta-value">${escapeHtml(formatLongDisplayDate(report.generatedAt))}</span>
              <span class="meta-label">Coverage</span>
              <span class="meta-value">${escapeHtml(formatDateRangeLabel(report.reportWindow))}</span>
            </td>
          </tr>
        </table>
      </div>

      <div class="content">
        <section class="overview">
          <h2>Executive Summary</h2>
          <p>
            This update covers the work completed for ${escapeHtml(report.projectName)} during
            ${escapeHtml(formatDateRangeLabel(report.reportWindow))}, along with the current delivery
            status and the next areas of focus.
          </p>
          <table class="metrics" role="presentation">
            <tr>
              <td>
                <div class="metric-card">
                  <span class="metric-label">Completed</span>
                  <span class="metric-value">${escapeHtml(report.completedStories.length)}</span>
                </div>
              </td>
              <td>
                <div class="metric-card">
                  <span class="metric-label">In Progress</span>
                  <span class="metric-value">${escapeHtml(report.inProgressItems.length)}</span>
                </div>
              </td>
              <td>
                <div class="metric-card">
                  <span class="metric-label">Quality Status</span>
                  <span class="metric-value">${escapeHtml(latestQualityState)}</span>
                </div>
              </td>
            </tr>
          </table>
        </section>

        <section class="content-section">
          <h2>Completed This Period</h2>
          <div class="stack">${completedSection}</div>
        </section>

        <section class="content-section">
          <h2>Currently In Progress</h2>
          <div class="stack">
            ${renderSummaryList(
              report.inProgressItems,
              "There are no active work items called out for this period.",
            )}
          </div>
        </section>

        <section class="content-section">
          <h2>Quality Check</h2>
          ${renderWorkflowStatus(report.workflowStatus)}
        </section>

        ${renderOptionalSection("Open Questions or Blockers", report.blockers)}
        ${renderOptionalSection("Next Focus", report.nextFocus)}
      </div>
    </div>
  </body>
</html>`;
}

export function renderEmailText(report) {
  const lines = [
    report.subject,
    `Company: ${report.branding?.companyName || report.projectName}`,
    `Reporting period: ${formatDateRangeLabel(report.reportWindow)}`,
    `Generated: ${formatLongDisplayDate(report.generatedAt)}`,
    "",
    "Completed this period:",
  ];

  if (!report.completedStories.length) {
    lines.push("- No completed milestones were finalized in this reporting period.");
  } else {
    for (const story of report.completedStories) {
      lines.push(`- ${story.title}`);
      lines.push(`  Story: ${story.storyDetail || story.story}`);
      lines.push(
        `  Marked done: ${
          story.completedAt ? formatLongDisplayDate(story.completedAt) : "Not tracked"
        }`,
      );
    }
  }

  lines.push("", "Currently in progress:");
  if (!report.inProgressItems.length) {
    lines.push("- There are no active work items called out for this period.");
  } else {
    for (const item of report.inProgressItems) {
      lines.push(`- ${item.title}: ${item.summary}`);
    }
  }

  lines.push("", "Quality check:");
  lines.push(`- ${report.workflowStatus.summary}`);

  if (report.blockers.length) {
    lines.push("", "Open questions or blockers:");
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
    `Merged PRs fetched: ${report.mergedPullRequests.length}`,
    `Workflow summary: ${report.workflowStatus.summary}`,
  ].join("\n");
}

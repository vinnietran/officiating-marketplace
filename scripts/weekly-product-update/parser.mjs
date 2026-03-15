const FALLBACK_OUTCOME = "This work is complete and is now available in the product.";
const FALLBACK_VALIDATION = "Validation details were not captured in the issue.";

function normalizeHeading(heading) {
  return heading.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function cleanLine(line) {
  return line
    .replace(/^\s*[-*+]\s+/, "")
    .replace(/^\s*\d+\.\s+/, "")
    .replace(/^\s*\[[ xX]\]\s+/, "")
    .trim();
}

export function stripMarkdown(markdown = "") {
  return markdown
    .replace(/!\[([^\]]*)\]\([^)]+\)/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/[*_~>#]/g, "")
    .replace(/^\s*[-*+]\s+/gm, "")
    .replace(/^\s*\d+\.\s+/gm, "")
    .replace(/^\s*\[[ xX]\]\s+/gm, "")
    .replace(/\r/g, "")
    .replace(/\n{2,}/g, "\n\n")
    .trim();
}

export function extractSections(markdown = "") {
  const sections = new Map();
  const lines = markdown.split(/\r?\n/);
  let currentHeading = "";
  let buffer = [];

  function commit() {
    if (!currentHeading) {
      return;
    }

    const value = buffer.join("\n").trim();
    if (value) {
      sections.set(currentHeading, value);
    }
  }

  for (const line of lines) {
    const headingMatch = line.match(/^#{2,6}\s+(.+?)\s*$/);

    if (headingMatch) {
      commit();
      currentHeading = normalizeHeading(headingMatch[1]);
      buffer = [];
      continue;
    }

    buffer.push(line);
  }

  commit();
  return sections;
}

function pickFirstSection(sections, names) {
  for (const name of names) {
    const value = sections.get(normalizeHeading(name));
    if (value) {
      return value;
    }
  }

  return "";
}

function truncateGracefully(text, maxLength) {
  const cleanText = text.trim();

  if (cleanText.length <= maxLength) {
    return cleanText;
  }

  const clipped = cleanText.slice(0, maxLength).trim();
  const sentenceBoundary = clipped.lastIndexOf(". ");
  if (sentenceBoundary >= Math.floor(maxLength * 0.55)) {
    return `${clipped.slice(0, sentenceBoundary + 1).trim()}…`;
  }

  const wordBoundary = clipped.lastIndexOf(" ");
  return `${clipped.slice(0, wordBoundary > 0 ? wordBoundary : maxLength).trim()}…`;
}

function firstMeaningfulParagraph(markdown = "", maxLength = 220) {
  const paragraphs = markdown
    .split(/\n\s*\n/)
    .map((paragraph) => {
      const cleaned = stripMarkdown(paragraph);
      return Number.isFinite(maxLength) ? truncateGracefully(cleaned, maxLength) : cleaned;
    })
    .filter((paragraph) => paragraph.length > 20);

  return paragraphs[0] ?? "";
}

export function extractBullets(markdown = "") {
  return markdown
    .split(/\r?\n/)
    .filter((line) => /^\s*(?:[-*+]|\d+\.)\s+/.test(line) || /^\s*\[[ xX]\]\s+/.test(line))
    .map((line) => stripMarkdown(cleanLine(line)))
    .filter(Boolean);
}

function ensureSentence(text) {
  return /[.?!]$/.test(text) ? text : `${text}.`;
}

function normalizeOutcomeSource(text) {
  return text
    .replace(/^(allow|enable)\s+(.+?)\s+to\s+(.+)$/i, (_, __, subject, action) => {
      return `${subject.charAt(0).toUpperCase() + subject.slice(1)} can now ${action}`;
    })
    .replace(/^support\s+(.+)$/i, "The product now supports $1")
    .replace(/^users can /i, "Users can now ")
    .replace(/^admins can /i, "Admins can now ")
    .replace(/^schools can /i, "Schools can now ")
    .replace(/^officials can /i, "Officials can now ");
}

function summarize(text, maxLength) {
  return truncateGracefully(stripMarkdown(text).replace(/\s+/g, " "), maxLength);
}

function deriveOutcome(title, sourceText) {
  if (!sourceText) {
    return FALLBACK_OUTCOME;
  }

  const normalized = normalizeOutcomeSource(summarize(sourceText, 180));
  if (!normalized) {
    return `The "${title}" work is complete and available for stakeholder review.`;
  }

  return ensureSentence(normalized);
}

export function parseStoryDetails(issue) {
  const body = issue.body ?? "";
  const sections = extractSections(body);
  const fallbackParagraph = firstMeaningfulParagraph(body);
  const fullFallbackParagraph = firstMeaningfulParagraph(body, Number.POSITIVE_INFINITY);
  const summarySection = pickFirstSection(sections, [
    "summary",
    "background",
    "overview",
    "story",
    "context",
  ]);
  const acceptanceCriteria = pickFirstSection(sections, [
    "acceptance criteria",
    "criteria",
    "requirements",
  ]);
  const outcomeSection = pickFirstSection(sections, [
    "implemented outcome",
    "outcome",
    "result",
    "delivered",
    "notes",
  ]);
  const validationSection = pickFirstSection(sections, ["validation", "testing", "qa"]);
  const acceptanceBullets = extractBullets(acceptanceCriteria);
  const fullStoryDetail = stripMarkdown(
    summarySection || fullFallbackParagraph || acceptanceBullets[0] || issue.title,
  ).trim();

  const storySummary = summarize(
    summarySection || fallbackParagraph || acceptanceBullets[0] || issue.title,
    220,
  );

  return {
    number: issue.number,
    title: issue.title,
    url: issue.html_url,
    story: ensureSentence(storySummary),
    storyDetail: ensureSentence(fullStoryDetail || issue.title),
    completedOutcome: deriveOutcome(
      issue.title,
      outcomeSection || acceptanceBullets[0] || summarySection || fallbackParagraph,
    ),
    validation: validationSection
      ? ensureSentence(summarize(validationSection, 160))
      : FALLBACK_VALIDATION,
    acceptanceCriteria: acceptanceBullets,
  };
}

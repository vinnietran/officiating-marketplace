import type { UserProfile } from "../types";

export interface OfficialSearchResult {
  official: UserProfile;
  meta: string;
}

interface SearchOfficialsOptions {
  limit?: number;
  excludeOfficialIds?: Iterable<string>;
}

function normalizeSearchText(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9@]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenizeSearchText(value: string): string[] {
  return normalizeSearchText(value)
    .split(" ")
    .map((token) => token.trim())
    .filter(Boolean);
}

function tokensMatchInOrder(
  candidateTokens: string[],
  queryTokens: string[],
  match: "prefix" | "contains"
): boolean {
  if (queryTokens.length === 0) {
    return false;
  }

  let candidateIndex = 0;
  for (const queryToken of queryTokens) {
    let matched = false;
    while (candidateIndex < candidateTokens.length) {
      const candidateToken = candidateTokens[candidateIndex];
      candidateIndex += 1;
      if (
        (match === "prefix" && candidateToken.startsWith(queryToken)) ||
        (match === "contains" && candidateToken.includes(queryToken))
      ) {
        matched = true;
        break;
      }
    }

    if (!matched) {
      return false;
    }
  }

  return true;
}

function everyQueryTokenMatches(
  candidateTokens: string[],
  queryTokens: string[],
  match: "prefix" | "contains"
): boolean {
  if (queryTokens.length === 0) {
    return false;
  }

  return queryTokens.every((queryToken) =>
    candidateTokens.some((candidateToken) =>
      match === "prefix"
        ? candidateToken.startsWith(queryToken)
        : candidateToken.includes(queryToken)
    )
  );
}

function getOfficialSearchRank(official: UserProfile, rawQuery: string): number | null {
  const normalizedQuery = normalizeSearchText(rawQuery);
  if (!normalizedQuery) {
    return null;
  }

  const queryTokens = tokenizeSearchText(rawQuery);
  const normalizedName = normalizeSearchText(official.displayName);
  const nameTokens = tokenizeSearchText(official.displayName);
  const normalizedEmail = official.email.trim().toLowerCase();

  if (normalizedName === normalizedQuery) {
    return 0;
  }

  if (normalizedName.startsWith(normalizedQuery)) {
    return 1;
  }

  if (
    tokensMatchInOrder(nameTokens, queryTokens, "prefix") ||
    everyQueryTokenMatches(nameTokens, queryTokens, "prefix")
  ) {
    return 2;
  }

  if (
    normalizedName.includes(normalizedQuery) ||
    tokensMatchInOrder(nameTokens, queryTokens, "contains") ||
    everyQueryTokenMatches(nameTokens, queryTokens, "contains")
  ) {
    return 3;
  }

  if (normalizedEmail.startsWith(rawQuery.trim().toLowerCase())) {
    return 4;
  }

  if (normalizedEmail.includes(rawQuery.trim().toLowerCase())) {
    return 5;
  }

  return null;
}

export function formatOfficialSearchMeta(official: UserProfile): string {
  const locationParts = [
    official.contactInfo?.city?.trim() ?? "",
    official.contactInfo?.state?.trim() ?? ""
  ].filter(Boolean);
  const locationLabel = locationParts.join(", ");
  const levelsLabel = (official.levelsOfficiated ?? []).slice(0, 2).join(", ");

  return [locationLabel, levelsLabel, official.email].filter(Boolean).join(" • ");
}

export function searchOfficials(
  officials: UserProfile[],
  rawQuery: string,
  options: SearchOfficialsOptions = {}
): OfficialSearchResult[] {
  const normalizedQuery = normalizeSearchText(rawQuery);
  if (!normalizedQuery) {
    return [];
  }

  const excludedIds = new Set(options.excludeOfficialIds ?? []);

  return officials
    .filter((official) => !excludedIds.has(official.uid))
    .map((official) => ({
      official,
      rank: getOfficialSearchRank(official, rawQuery)
    }))
    .filter((entry): entry is { official: UserProfile; rank: number } => entry.rank !== null)
    .sort((left, right) => {
      if (left.rank !== right.rank) {
        return left.rank - right.rank;
      }

      const leftName = left.official.displayName.trim();
      const rightName = right.official.displayName.trim();
      if (leftName !== rightName) {
        return leftName.localeCompare(rightName);
      }

      return left.official.email.localeCompare(right.official.email);
    })
    .slice(0, options.limit ?? 10)
    .map(({ official }) => ({
      official,
      meta: formatOfficialSearchMeta(official)
    }));
}

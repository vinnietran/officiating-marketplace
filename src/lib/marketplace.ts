import { getBidWindowInfo } from "./format";
import type { Game, UserRole } from "../types";

export interface OfficialLocationContext {
  hasLocation: boolean;
  city: string;
  state: string;
  postalCode: string;
  tokens: string[];
}

export function normalizeForMatch(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();
}

export function tokenizeForMatch(value: string): string[] {
  return normalizeForMatch(value)
    .split(" ")
    .map((token) => token.trim())
    .filter((token) => token.length >= 3);
}

export function buildQualifiedGameLevels(officialLevels: Set<string>): Set<Game["level"]> {
  const qualified = new Set<Game["level"]>();

  if (officialLevels.has("Varsity")) {
    qualified.add("Varsity");
    qualified.add("Junior Varsity");
    qualified.add("Middle School");
    qualified.add("Youth");
  }

  if (officialLevels.has("Sub Varsity")) {
    qualified.add("Junior Varsity");
    qualified.add("Middle School");
    qualified.add("Youth");
  }

  if (
    officialLevels.has("NCAA DI") ||
    officialLevels.has("NCAA DII") ||
    officialLevels.has("NCAA DIII")
  ) {
    qualified.add("NCAA");
    qualified.add("Varsity");
    qualified.add("Junior Varsity");
    qualified.add("Middle School");
    qualified.add("Youth");
  }

  return qualified;
}

export function getLocationClosenessScore(
  game: Pick<Game, "location">,
  locationContext: OfficialLocationContext | null
): number {
  if (!locationContext?.hasLocation) {
    return 0.5;
  }

  const locationText = normalizeForMatch(game.location);
  let score = 0;

  if (locationContext.postalCode && locationText.includes(locationContext.postalCode)) {
    score += 1;
  }
  if (locationContext.city && locationText.includes(locationContext.city)) {
    score += 0.85;
  }
  if (locationContext.state && locationText.includes(locationContext.state)) {
    score += 0.45;
  }
  if (locationContext.tokens.length) {
    const tokenHits = locationContext.tokens.reduce((hits, token) => {
      return hits + (locationText.includes(token) ? 1 : 0);
    }, 0);
    score += Math.min(tokenHits / Math.max(locationContext.tokens.length, 1), 0.6);
  }

  return Math.min(score / 1.8, 1);
}

export function filterAvailableMarketplaceGames(
  games: Game[],
  role: UserRole | undefined,
  nowMs: number
): Game[] {
  return games.filter((game) => {
    const bidWindowInfo = getBidWindowInfo(game.acceptingBidsUntilISO, game.status, nowMs);

    if (bidWindowInfo.state === "closed") {
      return false;
    }

    if (role === "official" && game.mode === "direct_assignment") {
      return false;
    }

    return true;
  });
}

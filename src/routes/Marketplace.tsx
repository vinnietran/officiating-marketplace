import { useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { AuthPanel } from "../components/AuthPanel";
import { CompleteProfilePanel } from "../components/CompleteProfilePanel";
import { Filters, type FilterValues } from "../components/Filters";
import { GameCard } from "../components/GameCard";
import { MessageModal } from "../components/MessageModal";
import { Select } from "../components/ui/Select";
import { useAuth } from "../context/AuthContext";
import {
  getCoordinatesForAddress,
  getDistanceMilesBetweenAddresses,
  getDistanceMilesBetweenPoints,
  getDistanceMilesFromCoordinatesToAddress
} from "../lib/googlePlaces";
import {
  createBid,
  deleteBid,
  getUserProfile,
  getUserProfilesByUids,
  subscribeCrews,
  subscribeBids,
  subscribeGames,
  updateBid,
  updateGame
} from "../lib/firestore";
import { FIRESTORE_DATABASE_ID } from "../lib/firebase";
import { getReadableFirestoreError } from "../lib/firebaseErrors";
import { formatCurrency, formatGameDate } from "../lib/format";
import {
  findActiveBid,
  getBidEligibleCrews,
  getCrewMemberCrews,
  requiresCrewBidForGame
} from "../lib/bids";
import {
  buildQualifiedGameLevels,
  filterAvailableMarketplaceGames,
  getLocationClosenessScore,
  normalizeForMatch,
  tokenizeForMatch,
  type OfficialLocationContext
} from "../lib/marketplace";
import type { Bid, Crew, Game, GeoPoint, UserProfile } from "../types";

const DEFAULT_FILTERS: FilterValues = {
  search: "",
  sport: "All",
  level: "All",
  minPay: ""
};

type OfficialQuickFilter = "all" | "open_bids" | "won_bids";
type MarketplaceSortOption =
  | "best_match"
  | "date_soonest"
  | "pay_high"
  | "pay_low"
  | "bid_deadline"
  | "closest";

interface FeaturedSuggestion {
  game: Game;
  score: number;
  distanceMiles?: number | null;
  badges: Array<"Closest to you" | "Highest Paying" | "Best fit">;
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, fallback: T): Promise<T> {
  return new Promise<T>((resolve) => {
    const timeoutId = window.setTimeout(() => {
      resolve(fallback);
    }, timeoutMs);

    promise
      .then((value) => resolve(value))
      .catch(() => resolve(fallback))
      .finally(() => window.clearTimeout(timeoutId));
  });
}

const OFFICIAL_COORDINATES_TIMEOUT_MS = 30000;
const PROFILE_COORDINATES_TIMEOUT_MS = 15000;
const DISTANCE_LOOKUP_TIMEOUT_MS = 90000;

function toGeoPoint(value: unknown): GeoPoint | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const record = value as Record<string, unknown>;
  const lat =
    typeof record.lat === "number"
      ? record.lat
      : typeof record.latitude === "number"
        ? record.latitude
        : null;
  const lng =
    typeof record.lng === "number"
      ? record.lng
      : typeof record.longitude === "number"
        ? record.longitude
        : null;

  const parsedLat = typeof lat === "number" ? lat : Number.NaN;
  const parsedLng = typeof lng === "number" ? lng : Number.NaN;
  if (!Number.isFinite(parsedLat) || !Number.isFinite(parsedLng)) {
    return null;
  }

  return { lat: parsedLat, lng: parsedLng };
}

export function Marketplace() {
  const navigate = useNavigate();
  const { user, profile, loading, profileLoading } = useAuth();
  const listingsRef = useRef<HTMLElement | null>(null);

  const [filters, setFilters] = useState<FilterValues>(DEFAULT_FILTERS);
  const [officialQuickFilter, setOfficialQuickFilter] =
    useState<OfficialQuickFilter>("all");
  const [sortBy, setSortBy] = useState<MarketplaceSortOption>("best_match");
  const [games, setGames] = useState<Game[]>([]);
  const [bids, setBids] = useState<Bid[]>([]);
  const [crews, setCrews] = useState<Crew[]>([]);
  const [freshOfficialProfile, setFreshOfficialProfile] = useState<UserProfile | null>(null);
  const [distanceByGameId, setDistanceByGameId] = useState<Record<string, number | null>>({});
  const [dataError, setDataError] = useState<string | null>(null);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [modalMessage, setModalMessage] = useState<{
    title: string;
    message: string;
  } | null>(null);
  const deferredFilters = useDeferredValue(filters);
  const isOfficial = profile?.role === "official";

  useEffect(() => {
    const timerId = window.setInterval(() => {
      setNowMs(Date.now());
    }, 60000);

    return () => window.clearInterval(timerId);
  }, []);

  useEffect(() => {
    if (!user) {
      setGames([]);
      setBids([]);
      setCrews([]);
      setOfficialQuickFilter("all");
      return;
    }

    const unsubscribeGames = subscribeGames(setGames, (error) =>
      setDataError(getReadableFirestoreError(error, FIRESTORE_DATABASE_ID))
    );
    const unsubscribeBids = subscribeBids(setBids, (error) =>
      setDataError(getReadableFirestoreError(error, FIRESTORE_DATABASE_ID))
    );
    const unsubscribeCrews = subscribeCrews(setCrews, (error) =>
      setDataError(getReadableFirestoreError(error, FIRESTORE_DATABASE_ID))
    );

    return () => {
      unsubscribeGames();
      unsubscribeBids();
      unsubscribeCrews();
    };
  }, [user]);

  useEffect(() => {
    if (profile?.role !== "official" && officialQuickFilter !== "all") {
      setOfficialQuickFilter("all");
    }
  }, [officialQuickFilter, profile?.role]);

  useEffect(() => {
    if (profile?.role !== "official" && sortBy === "closest") {
      setSortBy("best_match");
    }
  }, [profile?.role, sortBy]);

  useEffect(() => {
    if (!user || profile?.role !== "official") {
      setFreshOfficialProfile(null);
      return;
    }

    let cancelled = false;
    void getUserProfile(user.uid)
      .then((latestProfile) => {
        if (cancelled || !latestProfile || latestProfile.role !== "official") {
          return;
        }
        setFreshOfficialProfile(latestProfile);
      })
      .catch(() => {
        if (!cancelled) {
          setFreshOfficialProfile(null);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [profile?.role, user]);

  const distanceProfile = useMemo(() => {
    if (!profile || profile.role !== "official") {
      return null;
    }

    if (freshOfficialProfile && freshOfficialProfile.uid === profile.uid) {
      return freshOfficialProfile;
    }

    return profile;
  }, [freshOfficialProfile, profile]);

  const availableGames = useMemo(() => {
    return filterAvailableMarketplaceGames(games, profile?.role, nowMs);
  }, [games, profile?.role, nowMs]);

  const officialOpenBidGames = useMemo(() => {
    if (!user || profile?.role !== "official") {
      return [];
    }

    const openGameIds = new Set(availableGames.map((game) => game.id));
    const gameIdSet = new Set(
      bids
        .filter((bid) => bid.officialUid === user.uid && openGameIds.has(bid.gameId))
        .map((bid) => bid.gameId)
    );

    return availableGames.filter((game) => gameIdSet.has(game.id));
  }, [availableGames, bids, profile?.role, user]);

  const officialWonBidGames = useMemo(() => {
    if (!user || profile?.role !== "official") {
      return [];
    }

    const bidsById = new Map<string, Bid>();
    bids.forEach((bid) => bidsById.set(bid.id, bid));

    return games
      .filter((game) => {
        if (game.status !== "awarded" || game.mode === "direct_assignment") {
          return false;
        }
        if (!game.selectedBidId) {
          return false;
        }
        return bidsById.get(game.selectedBidId)?.officialUid === user.uid;
      })
      .sort((a, b) => new Date(a.dateISO).getTime() - new Date(b.dateISO).getTime());
  }, [bids, games, profile?.role, user]);

  const listingPoolGames = useMemo(() => {
    if (profile?.role !== "official") {
      return availableGames;
    }

    if (officialQuickFilter === "open_bids") {
      return officialOpenBidGames;
    }
    if (officialQuickFilter === "won_bids") {
      return officialWonBidGames;
    }
    return availableGames;
  }, [
    availableGames,
    officialOpenBidGames,
    officialQuickFilter,
    officialWonBidGames,
    profile?.role
  ]);

  const filteredGames = useMemo(() => {
    const minPay =
      deferredFilters.minPay.trim() === "" ? null : Number(deferredFilters.minPay);

    return listingPoolGames.filter((game) => {
      const matchesSearch = game.schoolName
        .toLowerCase()
        .includes(deferredFilters.search.trim().toLowerCase());
      const matchesSport =
        deferredFilters.sport === "All" || game.sport === deferredFilters.sport;
      const matchesLevel =
        deferredFilters.level === "All" || game.level === deferredFilters.level;
      const matchesPay =
        minPay === null || Number.isNaN(minPay) ? true : game.payPosted >= minPay;

      return matchesSearch && matchesSport && matchesLevel && matchesPay;
    });
  }, [deferredFilters, listingPoolGames]);

  const memberCrews = useMemo(() => {
    if (!user || profile?.role !== "official") {
      return [];
    }

    return getCrewMemberCrews(crews, user.uid);
  }, [crews, profile?.role, user]);

  const officialCrews = useMemo(() => {
    if (!user || profile?.role !== "official") {
      return [];
    }

    return getBidEligibleCrews(memberCrews, user.uid);
  }, [memberCrews, profile?.role, user]);

  const crewBidUnavailableReason = useMemo(() => {
    if (!user || profile?.role !== "official") {
      return null;
    }

    if (officialCrews.length > 0) {
      return null;
    }

    if (memberCrews.length > 0) {
      return "You are a member of one or more crews, but you are not the Referee for any crew eligible to place this bid.";
    }

    return "Varsity games require crew bids. Join or create a crew to bid.";
  }, [memberCrews.length, officialCrews.length, profile?.role, user]);

  const hasActiveFilters = useMemo(() => {
    return Boolean(
      filters.search.trim() ||
        filters.sport !== "All" ||
        filters.level !== "All" ||
        filters.minPay.trim() ||
        (profile?.role === "official" && officialQuickFilter !== "all")
    );
  }, [filters, officialQuickFilter, profile?.role]);

  const uniqueOpenBidGameCount = useMemo(() => {
    if (!user || profile?.role !== "official") {
      return 0;
    }

    return officialOpenBidGames.length;
  }, [officialOpenBidGames, profile?.role, user]);

  const postedOpenGameCount = useMemo(() => {
    if (!user || (profile?.role !== "assignor" && profile?.role !== "school")) {
      return 0;
    }
    return availableGames.filter((game) => game.createdByUid === user.uid).length;
  }, [availableGames, profile?.role, user]);

  const postedOpenBidCount = useMemo(() => {
    if (!user || (profile?.role !== "assignor" && profile?.role !== "school")) {
      return 0;
    }

    const openGameIds = new Set(
      availableGames
        .filter((game) => game.createdByUid === user.uid)
        .map((game) => game.id)
    );
    return bids.filter((bid) => openGameIds.has(bid.gameId)).length;
  }, [availableGames, bids, profile?.role, user]);

  const averageOpenPay = useMemo(() => {
    if (availableGames.length === 0) {
      return 0;
    }
    const total = availableGames.reduce((sum, game) => sum + game.payPosted, 0);
    return total / availableGames.length;
  }, [availableGames]);

  const officialLocationContext = useMemo<OfficialLocationContext | null>(() => {
    if (!distanceProfile || distanceProfile.role !== "official") {
      return null;
    }

    const contact = distanceProfile.contactInfo;
    const locationParts = [
      contact?.addressLine1 ?? "",
      contact?.addressLine2 ?? "",
      contact?.city ?? "",
      contact?.state ?? "",
      contact?.postalCode ?? ""
    ].filter((value) => value.trim() !== "");

    const locationSource = locationParts.join(" ");
    const tokens = Array.from(new Set(tokenizeForMatch(locationSource)));

    return {
      hasLocation: locationParts.length > 0,
      city: normalizeForMatch(contact?.city ?? ""),
      state: normalizeForMatch(contact?.state ?? ""),
      postalCode: normalizeForMatch(contact?.postalCode ?? ""),
      tokens
    };
  }, [distanceProfile]);

  const officialAddressForDistance = useMemo(() => {
    if (!distanceProfile || distanceProfile.role !== "official") {
      return "";
    }

    const contact = distanceProfile.contactInfo;
    return [
      contact?.addressLine1 ?? "",
      contact?.addressLine2 ?? "",
      contact?.city ?? "",
      contact?.state ?? "",
      contact?.postalCode ?? ""
    ]
      .map((value) => value.trim())
      .filter(Boolean)
      .join(", ");
  }, [distanceProfile]);

  const officialCoordinates = useMemo(() => {
    if (!distanceProfile || distanceProfile.role !== "official") {
      return null;
    }
    return toGeoPoint(distanceProfile.locationCoordinates);
  }, [distanceProfile]);

  const distanceTargetGames = useMemo(() => {
    if (profile?.role !== "official") {
      return [];
    }

    const uniqueGames = new Map<string, Game>();
    availableGames.forEach((game) => uniqueGames.set(game.id, game));
    officialWonBidGames.forEach((game) => uniqueGames.set(game.id, game));
    return Array.from(uniqueGames.values());
  }, [availableGames, officialWonBidGames, profile?.role]);

  useEffect(() => {
    if (!profile || profile.role !== "official") {
      setDistanceByGameId({});
      return;
    }

    if (distanceTargetGames.length === 0) {
      setDistanceByGameId({});
      return;
    }

    const unresolvedDistances = Object.fromEntries(
      distanceTargetGames.map((game) => [game.id, null] as const)
    );

    let cancelled = false;
    if (!officialCoordinates && !officialAddressForDistance) {
      setDistanceByGameId(unresolvedDistances);
      return;
    }

    const officialCoordinatesPromise = officialCoordinates
      ? Promise.resolve(officialCoordinates)
      : officialAddressForDistance
        ? getCoordinatesForAddress(officialAddressForDistance)
        : Promise.resolve(null);

    void (async () => {
      const resolvedOfficialCoordinates = await withTimeout(
        officialCoordinatesPromise,
        OFFICIAL_COORDINATES_TIMEOUT_MS,
        null
      );

      const creatorUidsNeedingFallback = Array.from(
        new Set(
          distanceTargetGames
            .filter((game) => !toGeoPoint(game.locationCoordinates))
            .map((game) => game.createdByUid)
            .filter(Boolean)
        )
      );
      const creatorCoordinatesByUid = new Map<string, GeoPoint>();
      if (creatorUidsNeedingFallback.length > 0) {
        const creatorProfilesByUid = await withTimeout(
          getUserProfilesByUids(creatorUidsNeedingFallback),
          PROFILE_COORDINATES_TIMEOUT_MS,
          {}
        );
        Object.values(creatorProfilesByUid).forEach((creatorProfile) => {
          const creatorCoordinates = toGeoPoint(creatorProfile.locationCoordinates);
          if (!creatorCoordinates) {
            return;
          }
          creatorCoordinatesByUid.set(creatorProfile.uid, creatorCoordinates);
        });
      }

      const entries = await Promise.all(
        distanceTargetGames.map(async (game) => {
          try {
            const gameAddress = typeof game.location === "string" ? game.location.trim() : "";
            const gameCoordinates = toGeoPoint(game.locationCoordinates);
            const creatorCoordinates = creatorCoordinatesByUid.get(game.createdByUid) ?? null;
            const bestKnownGameCoordinates = gameCoordinates ?? creatorCoordinates;

            let distanceMiles: number | null = null;
            if (resolvedOfficialCoordinates && bestKnownGameCoordinates) {
              distanceMiles = getDistanceMilesBetweenPoints(
                resolvedOfficialCoordinates,
                bestKnownGameCoordinates
              );
            } else if (resolvedOfficialCoordinates && gameAddress) {
              distanceMiles = await withTimeout(
                getDistanceMilesFromCoordinatesToAddress(
                  resolvedOfficialCoordinates,
                  gameAddress
                ),
                DISTANCE_LOOKUP_TIMEOUT_MS,
                null
              );
            } else if (officialAddressForDistance && gameAddress) {
              distanceMiles = await withTimeout(
                getDistanceMilesBetweenAddresses(officialAddressForDistance, gameAddress),
                DISTANCE_LOOKUP_TIMEOUT_MS,
                null
              );
            }

            if (typeof distanceMiles === "number" && !Number.isFinite(distanceMiles)) {
              distanceMiles = null;
            }

            return [game.id, distanceMiles] as const;
          } catch {
            return [game.id, null] as const;
          }
        })
      );

      if (import.meta.env.DEV) {
        const unresolvedGameIds = entries
          .filter((entry) => entry[1] === null)
          .map((entry) => entry[0]);
        if (unresolvedGameIds.length > 0) {
          const debugPayload = unresolvedGameIds.map((gameId) => {
            const game = distanceTargetGames.find((candidate) => candidate.id === gameId);
            return {
              gameId,
              location: game?.location ?? "",
              hasGameCoordinates: Boolean(game && toGeoPoint(game.locationCoordinates)),
              hasCreatorCoordinates: Boolean(
                game && creatorCoordinatesByUid.get(game.createdByUid)
              ),
              hasOfficialCoordinates: Boolean(resolvedOfficialCoordinates),
              officialAddressForDistance
            };
          });

          console.info("[distance] Unresolved game distances", debugPayload);
        }
      }

      if (cancelled) {
        return;
      }

      setDistanceByGameId(Object.fromEntries(entries));
    })().catch(() => {
      if (!cancelled) {
        setDistanceByGameId(unresolvedDistances);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [distanceTargetGames, officialAddressForDistance, officialCoordinates, profile]);

  const featuredSuggestions = useMemo(() => {
    if (!profile || profile.role !== "official") {
      return [];
    }

    const locationContext = officialLocationContext;
    const officialLevels = new Set<string>(profile.levelsOfficiated ?? []);
    const qualifiedGameLevels = buildQualifiedGameLevels(officialLevels);
    const pays = availableGames.map((game) => game.payPosted);
    const minPay = pays.length > 0 ? Math.min(...pays) : 0;
    const maxPay = pays.length > 0 ? Math.max(...pays) : 0;

    const scoredSuggestions = availableGames
      .map((game) => {
        const distanceMiles = distanceByGameId[game.id];
        const distanceBasedCloseness =
          typeof distanceMiles === "number" && Number.isFinite(distanceMiles)
            ? Math.max(0, 1 - Math.min(distanceMiles, 40) / 40)
            : null;
        const closenessScore =
          distanceBasedCloseness ?? getLocationClosenessScore(game, locationContext);
        const payScore =
          maxPay > minPay ? (game.payPosted - minPay) / (maxPay - minPay) : 1;
        const levelScore =
          qualifiedGameLevels.size === 0
            ? 0.6
            : qualifiedGameLevels.has(game.level)
              ? 1
              : 0;

        // Weighted model requested: closest game, highest pay, level match.
        const score = closenessScore * 55 + payScore * 25 + levelScore * 20;

        return {
          game,
          score,
          distanceMiles,
          closenessScore,
          payScore,
          levelScore
        };
      })
      .sort((a, b) => {
        if (b.score !== a.score) {
          return b.score - a.score;
        }
        if (b.game.payPosted !== a.game.payPosted) {
          return b.game.payPosted - a.game.payPosted;
        }
        return new Date(a.game.dateISO).getTime() - new Date(b.game.dateISO).getTime();
      });

    const featured = scoredSuggestions.slice(0, 3);
    if (featured.length === 0) {
      return [];
    }

    const closestGameId = locationContext?.hasLocation
      ? [...featured].sort((a, b) => {
          if (
            typeof a.distanceMiles === "number" &&
            Number.isFinite(a.distanceMiles) &&
            typeof b.distanceMiles === "number" &&
            Number.isFinite(b.distanceMiles) &&
            a.distanceMiles !== b.distanceMiles
          ) {
            return a.distanceMiles - b.distanceMiles;
          }
          if (
            typeof a.distanceMiles === "number" &&
            Number.isFinite(a.distanceMiles) &&
            !(typeof b.distanceMiles === "number" && Number.isFinite(b.distanceMiles))
          ) {
            return -1;
          }
          if (
            !(typeof a.distanceMiles === "number" && Number.isFinite(a.distanceMiles)) &&
            typeof b.distanceMiles === "number" &&
            Number.isFinite(b.distanceMiles)
          ) {
            return 1;
          }
          if (b.closenessScore !== a.closenessScore) {
            return b.closenessScore - a.closenessScore;
          }
          return b.score - a.score;
        })[0]?.game.id
      : null;

    const highestPayGameId = [...featured].sort((a, b) => {
      if (b.payScore !== a.payScore) {
        return b.payScore - a.payScore;
      }
      return b.score - a.score;
    })[0]?.game.id;

    const bestFitGameId = [...featured].sort((a, b) => {
      if (b.levelScore !== a.levelScore) {
        return b.levelScore - a.levelScore;
      }
      return b.score - a.score;
    })[0]?.game.id;

    return featured.map<FeaturedSuggestion>((entry) => {
      const badges: FeaturedSuggestion["badges"] = [];
      if (closestGameId && entry.game.id === closestGameId) {
        badges.push("Closest to you");
      }
      if (entry.game.id === highestPayGameId) {
        badges.push("Highest Paying");
      }
      if (entry.game.id === bestFitGameId) {
        badges.push("Best fit");
      }
      if (badges.length === 0) {
        badges.push("Best fit");
      }

      return {
        game: entry.game,
        score: entry.score,
        distanceMiles: entry.distanceMiles,
        badges
      };
    });
  }, [availableGames, distanceByGameId, officialLocationContext, profile]);

  const bestMatchScoreByGameId = useMemo(() => {
    if (!profile || profile.role !== "official") {
      return new Map<string, number>();
    }

    const officialLevels = new Set<string>(profile.levelsOfficiated ?? []);
    const qualifiedGameLevels = buildQualifiedGameLevels(officialLevels);
    const pays = listingPoolGames.map((game) => game.payPosted);
    const minPay = pays.length > 0 ? Math.min(...pays) : 0;
    const maxPay = pays.length > 0 ? Math.max(...pays) : 0;
    const scoreById = new Map<string, number>();

    listingPoolGames.forEach((game) => {
      const distanceMiles = distanceByGameId[game.id];
      const distanceBasedCloseness =
        typeof distanceMiles === "number" && Number.isFinite(distanceMiles)
          ? Math.max(0, 1 - Math.min(distanceMiles, 40) / 40)
          : null;
      const closenessScore =
        distanceBasedCloseness ?? getLocationClosenessScore(game, officialLocationContext);
      const payScore =
        maxPay > minPay ? (game.payPosted - minPay) / (maxPay - minPay) : 1;
      const levelScore =
        qualifiedGameLevels.size === 0
          ? 0.6
          : qualifiedGameLevels.has(game.level)
            ? 1
            : 0;
      scoreById.set(game.id, closenessScore * 55 + payScore * 25 + levelScore * 20);
    });

    return scoreById;
  }, [distanceByGameId, listingPoolGames, officialLocationContext, profile]);

  const sortedGames = useMemo(() => {
    const gamesToSort = [...filteredGames];

    function dateValue(game: Game): number {
      return new Date(game.dateISO).getTime();
    }

    function bidDeadlineValue(game: Game): number {
      return game.acceptingBidsUntilISO
        ? new Date(game.acceptingBidsUntilISO).getTime()
        : Number.MAX_SAFE_INTEGER;
    }

    function closestValue(game: Game): number {
      const distance = distanceByGameId[game.id];
      return typeof distance === "number" && Number.isFinite(distance)
        ? distance
        : Number.MAX_SAFE_INTEGER;
    }

    gamesToSort.sort((a, b) => {
      if (sortBy === "pay_high") {
        return b.payPosted - a.payPosted || dateValue(a) - dateValue(b);
      }
      if (sortBy === "pay_low") {
        return a.payPosted - b.payPosted || dateValue(a) - dateValue(b);
      }
      if (sortBy === "date_soonest") {
        return dateValue(a) - dateValue(b) || b.payPosted - a.payPosted;
      }
      if (sortBy === "bid_deadline") {
        return bidDeadlineValue(a) - bidDeadlineValue(b) || dateValue(a) - dateValue(b);
      }
      if (sortBy === "closest") {
        return closestValue(a) - closestValue(b) || b.payPosted - a.payPosted;
      }

      if (profile?.role === "official") {
        const scoreDiff =
          (bestMatchScoreByGameId.get(b.id) ?? 0) - (bestMatchScoreByGameId.get(a.id) ?? 0);
        if (scoreDiff !== 0) {
          return scoreDiff;
        }
      }

      const aClosingSoon = bidDeadlineValue(a);
      const bClosingSoon = bidDeadlineValue(b);
      if (aClosingSoon !== bClosingSoon) {
        return aClosingSoon - bClosingSoon;
      }

      return b.payPosted - a.payPosted || dateValue(a) - dateValue(b);
    });

    return gamesToSort;
  }, [bestMatchScoreByGameId, distanceByGameId, filteredGames, profile?.role, sortBy]);

  const featuredListing = sortedGames[0] ?? null;
  const endingSoonGame = useMemo(() => {
    return [...listingPoolGames]
      .filter((game) => Boolean(game.acceptingBidsUntilISO))
      .sort((a, b) => {
        const aTime = a.acceptingBidsUntilISO
          ? new Date(a.acceptingBidsUntilISO).getTime()
          : Number.MAX_SAFE_INTEGER;
        const bTime = b.acceptingBidsUntilISO
          ? new Date(b.acceptingBidsUntilISO).getTime()
          : Number.MAX_SAFE_INTEGER;
        return aTime - bTime;
      })[0] ?? null;
  }, [listingPoolGames]);
  const highestPayGame = useMemo(() => {
    return [...listingPoolGames].sort((a, b) => b.payPosted - a.payPosted)[0] ?? null;
  }, [listingPoolGames]);
  const closestGame = useMemo(() => {
    if (!isOfficial) {
      return null;
    }

    return [...listingPoolGames].sort((a, b) => {
      const aDistance = distanceByGameId[a.id];
      const bDistance = distanceByGameId[b.id];
      const aValue =
        typeof aDistance === "number" && Number.isFinite(aDistance)
          ? aDistance
          : Number.MAX_SAFE_INTEGER;
      const bValue =
        typeof bDistance === "number" && Number.isFinite(bDistance)
          ? bDistance
          : Number.MAX_SAFE_INTEGER;
      return aValue - bValue;
    })[0] ?? null;
  }, [distanceByGameId, isOfficial, listingPoolGames]);

  if (loading) {
    return (
      <main className="page">
        <p>Loading authentication...</p>
      </main>
    );
  }

  if (!user) {
    return (
      <main className="page">
        <header className="hero">
          <h1>Officiating Marketplace</h1>
          <p>Sign in to bid on games or post assignments.</p>
        </header>
        <AuthPanel />
      </main>
    );
  }

  if (profileLoading) {
    return (
      <main className="page">
        <p>Loading profile...</p>
      </main>
    );
  }

  if (!profile) {
    return (
      <main className="page">
        <header className="hero">
          <h1>Officiating Marketplace</h1>
        </header>
        <CompleteProfilePanel />
      </main>
    );
  }

  if (profile.role === "evaluator") {
    return <Navigate to="/schedule" replace />;
  }

  const activeUser = user;
  const activeProfile = profile;
  const canPostGames =
    activeProfile.role === "assignor" || activeProfile.role === "school";
  const noAddressDistanceLabel =
    activeProfile.role === "official" && !officialLocationContext?.hasLocation
      ? "Add your address in Profile"
      : undefined;

  async function handleUpdateGame(
    gameId: string,
    values: {
      schoolName: string;
      sport: Game["sport"];
      level: Game["level"];
      dateISO: string;
      acceptingBidsUntilISO?: string;
      location: string;
      payPosted: number;
      notes?: string;
    }
  ) {
    if (!canPostGames) {
      throw new Error("Only assignors and schools can edit games.");
    }

    const game = games.find((candidate) => candidate.id === gameId);
    if (!game || game.createdByUid !== activeUser.uid) {
      throw new Error("You can only edit games that you posted.");
    }

    await updateGame(gameId, values);
  }

  async function handleSubmitBid(
    gameId: string,
    input: {
      officialName: string;
      bidderType: "individual" | "crew";
      crewId?: string;
      crewName?: string;
      amount: number;
      message?: string;
    }
  ) {
    if (activeProfile.role !== "official") {
      throw new Error("Only officials can place bids.");
    }

    const game = games.find((candidate) => candidate.id === gameId);
    if (!game) {
      throw new Error("Game not found.");
    }

    if (game.status !== "open") {
      throw new Error("Bidding is closed for this game.");
    }
    if (game.mode === "direct_assignment") {
      throw new Error("This game was directly assigned and cannot accept bids.");
    }
    if (requiresCrewBidForGame(game) && input.bidderType !== "crew") {
      throw new Error("Varsity games require crew bids.");
    }

    const gameBids = bids.filter((bid) => bid.gameId === gameId);
    const selectedCrew =
      input.bidderType === "crew" && input.crewId
        ? officialCrews.find((crew) => crew.id === input.crewId) ?? null
        : null;

    if (input.bidderType === "crew" && !selectedCrew) {
      throw new Error("Only the Referee for this crew can place a crew bid.");
    }

    const latestOfficialBid = findActiveBid({
      bidderType: input.bidderType,
      existingBids: gameBids.filter((bid) => bid.officialUid === activeUser.uid),
      selectedCrewId: selectedCrew?.id ?? "",
      singleBidMode: false
    });

    if (latestOfficialBid) {
      if (input.amount <= latestOfficialBid.amount) {
        throw new Error("New offer must be higher than your current bid.");
      }

      await updateBid(latestOfficialBid.id, {
        officialName: input.officialName,
        bidderType: input.bidderType,
        crewId: selectedCrew?.id,
        crewName: selectedCrew?.name,
        amount: input.amount,
        message: input.message
      });
      setModalMessage({
        title: "Offer Increased",
        message: "Your bid was updated successfully."
      });
      return;
    }

    await createBid({
      gameId,
      officialUid: activeUser.uid,
      officialName: input.officialName,
      bidderType: input.bidderType,
      crewId: selectedCrew?.id,
      crewName: selectedCrew?.name,
      amount: input.amount,
      message: input.message
    });
    setModalMessage({
      title: "Bid Submitted",
      message: "Your bid was submitted successfully."
    });
  }

  async function handleDeleteBid(bidId: string) {
    await deleteBid(bidId);
  }

  function handleResetFilters() {
    setFilters({ ...DEFAULT_FILTERS });
    if (activeProfile.role === "official") {
      setOfficialQuickFilter("all");
    }
  }

  function handleOpenGameDetails(game: Game) {
    navigate(`/schedule/games/${game.id}`, {
      state: { from: "marketplace" }
    });
  }

  return (
    <main className="page marketplace-page">
      <header className="hero marketplace-hero marketplace-hero-compact">
        <span className="hero-eyebrow">Live marketplace</span>
        <h1>Officiating Marketplace</h1>
        <p>
          Search, compare, and act on live game listings with marketplace-style ranking and
          listing intelligence.
        </p>
        <div className="hero-actions">
          {canPostGames ? (
            <>
              <button type="button" onClick={() => navigate("/post-game")}>
                Post a Game
              </button>
              <button
                type="button"
                className="button-secondary"
                onClick={() => navigate("/assign-game")}
              >
                Assign Directly
              </button>
            </>
          ) : (
            <button type="button" className="button-secondary" onClick={() => navigate("/schedule")}>
              View Schedule
            </button>
          )}
        </div>
        <div className="marketplace-hero-stats">
          <article className="marketplace-hero-stat">
            <span className="marketplace-hero-stat-label">Open Listings</span>
            <strong className="marketplace-hero-stat-value">{availableGames.length}</strong>
          </article>
          <article className="marketplace-hero-stat">
            <span className="marketplace-hero-stat-label">Average Posted Pay</span>
            <strong className="marketplace-hero-stat-value">
              ${Math.round(averageOpenPay)}
            </strong>
          </article>
          <article className="marketplace-hero-stat">
            <span className="marketplace-hero-stat-label">
              {activeProfile.role === "official"
                ? "Your Active Bid Games"
                : canPostGames
                  ? "Your Open Games"
                  : "Open Listings"}
            </span>
            <strong className="marketplace-hero-stat-value">
              {activeProfile.role === "official"
                ? uniqueOpenBidGameCount
                : canPostGames
                  ? postedOpenGameCount
                  : availableGames.length}
            </strong>
          </article>
          {canPostGames ? (
            <article className="marketplace-hero-stat">
              <span className="marketplace-hero-stat-label">Bids On Your Open Games</span>
              <strong className="marketplace-hero-stat-value">{postedOpenBidCount}</strong>
            </article>
          ) : null}
        </div>
      </header>

      {dataError ? <p className="error-text">{dataError}</p> : null}

      <div className="marketplace-shell">
        <aside className="marketplace-sidebar">
          <section className="marketplace-toolbar marketplace-sidebar-card marketplace-sidebar-sticky">
            <Filters values={filters} onChange={setFilters} />
            {activeProfile.role === "official" ? (
              <div className="marketplace-quick-filters">
                <button
                  type="button"
                  className={`marketplace-quick-filter${
                    officialQuickFilter === "all" ? " marketplace-quick-filter-active" : ""
                  }`}
                  onClick={() => setOfficialQuickFilter("all")}
                >
                  All Games ({availableGames.length})
                </button>
                <button
                  type="button"
                  className={`marketplace-quick-filter${
                    officialQuickFilter === "open_bids"
                      ? " marketplace-quick-filter-active"
                      : ""
                  }`}
                  onClick={() => setOfficialQuickFilter("open_bids")}
                >
                  Open Bids ({officialOpenBidGames.length})
                </button>
                <button
                  type="button"
                  className={`marketplace-quick-filter${
                    officialQuickFilter === "won_bids"
                      ? " marketplace-quick-filter-active"
                      : ""
                  }`}
                  onClick={() => setOfficialQuickFilter("won_bids")}
                >
                  Won Bids ({officialWonBidGames.length})
                </button>
              </div>
            ) : null}
            <div className="marketplace-toolbar-actions marketplace-toolbar-actions-sidebar">
              <span className="meta-line">
                {sortedGames.length} of {listingPoolGames.length} listing(s) shown
              </span>
              {hasActiveFilters ? (
                <button
                  type="button"
                  className="button-secondary"
                  onClick={handleResetFilters}
                >
                  Clear Filters
                </button>
              ) : null}
            </div>
          </section>

          <section className="marketplace-featured marketplace-sidebar-card">
            <div className="results-header marketplace-results-header">
              <h2>Market Snapshot</h2>
              <span>Live signals</span>
            </div>
            <div className="marketplace-insights">
              <article className="marketplace-insight-card">
                <span className="marketplace-insight-label">Highest pay</span>
                <strong>
                  {highestPayGame ? formatCurrency(highestPayGame.payPosted) : "-"}
                </strong>
                <p>{highestPayGame ? highestPayGame.schoolName : "No listings yet"}</p>
              </article>
              <article className="marketplace-insight-card">
                <span className="marketplace-insight-label">Closing soon</span>
                <strong>
                  {endingSoonGame?.acceptingBidsUntilISO
                    ? new Date(endingSoonGame.acceptingBidsUntilISO).toLocaleDateString("en-US", {
                        month: "short",
                        day: "numeric"
                      })
                    : "-"}
                </strong>
                <p>{endingSoonGame ? endingSoonGame.schoolName : "No active bid windows"}</p>
              </article>
              {activeProfile.role === "official" ? (
                <article className="marketplace-insight-card">
                  <span className="marketplace-insight-label">Closest game</span>
                  <strong>
                    {closestGame
                      && typeof distanceByGameId[closestGame.id] === "number"
                      && Number.isFinite(distanceByGameId[closestGame.id])
                      ? `${distanceByGameId[closestGame.id]?.toFixed(1)} mi`
                      : noAddressDistanceLabel ?? "-"}
                  </strong>
                  <p>{closestGame ? closestGame.schoolName : "No location match yet"}</p>
                </article>
              ) : null}
            </div>
          </section>

          {activeProfile.role === "official" ? (
            <aside className="marketplace-featured marketplace-sidebar-card">
              <div className="results-header marketplace-results-header">
                <h2>Recommended</h2>
                <span>{featuredSuggestions.length} picks</span>
              </div>
              <p className="meta-line marketplace-featured-subtitle">
                {officialLocationContext?.hasLocation
                  ? "Ranked by fit, pay, and travel distance."
                  : "Add your address in Profile to improve location-based recommendations."}
              </p>
              {featuredSuggestions.length === 0 ? (
                <p className="empty-state">No featured games available right now.</p>
              ) : (
                <div className="marketplace-featured-stack">
                  {featuredSuggestions.map((suggestion, index) => (
                    <article
                      key={suggestion.game.id}
                      className="marketplace-featured-card clickable-game-card"
                      role="button"
                      tabIndex={0}
                      onClick={(event) => {
                        const target = event.target as HTMLElement;
                        if (target.closest("button, input, textarea, [role='combobox'], form, a")) {
                          return;
                        }
                        handleOpenGameDetails(suggestion.game);
                      }}
                      onKeyDown={(event) => {
                        if (event.key !== "Enter" && event.key !== " ") {
                          return;
                        }

                        const target = event.target as HTMLElement;
                        if (target.closest("button, input, textarea, [role='combobox'], form, a")) {
                          return;
                        }

                        event.preventDefault();
                        handleOpenGameDetails(suggestion.game);
                      }}
                      aria-label={`Open details for ${suggestion.game.schoolName}`}
                    >
                      <div className="marketplace-featured-card-head">
                        <span className="marketplace-featured-rank">#{index + 1}</span>
                        <span className="pay-pill">{formatCurrency(suggestion.game.payPosted)}</span>
                      </div>
                      <h3>{suggestion.game.schoolName}</h3>
                      <p className="meta-line">
                        <strong>{suggestion.game.sport}</strong> • {suggestion.game.level}
                      </p>
                      <div className="marketplace-featured-badges">
                        {suggestion.badges.map((badge) => (
                          <span key={badge} className="marketplace-featured-badge">
                            {badge}
                          </span>
                        ))}
                      </div>
                    </article>
                  ))}
                </div>
              )}
            </aside>
          ) : null}
        </aside>

        <section ref={listingsRef} className="marketplace-listings marketplace-results-column">
          <div className="marketplace-results-toolbar">
            <div className="marketplace-results-copy">
              <span className="hero-eyebrow">Browse listings</span>
              <h2>
                {activeProfile.role === "official" && officialQuickFilter === "open_bids"
                  ? "Open Bid Games"
                  : activeProfile.role === "official" && officialQuickFilter === "won_bids"
                    ? "Won Bid Games"
                    : "Available Games"}
              </h2>
              <p className="meta-line">
                Showing {sortedGames.length} results sorted for{" "}
                {sortBy === "best_match"
                  ? "best match"
                  : sortBy === "date_soonest"
                    ? "soonest game date"
                    : sortBy === "pay_high"
                      ? "highest pay"
                      : sortBy === "pay_low"
                        ? "lowest pay"
                        : sortBy === "bid_deadline"
                          ? "nearest bid deadline"
                          : "closest distance"}
                .
              </p>
            </div>

            <label className="marketplace-sort-control">
              Sort By
              <Select
                value={sortBy}
                onValueChange={setSortBy}
                options={[
                  { value: "best_match", label: "Best Match" },
                  { value: "date_soonest", label: "Game Date: Soonest" },
                  { value: "pay_high", label: "Pay: Highest First" },
                  { value: "pay_low", label: "Pay: Lowest First" },
                  { value: "bid_deadline", label: "Bid Deadline: Ending Soon" },
                  ...(activeProfile.role === "official"
                    ? [{ value: "closest" as const, label: "Closest First" }]
                    : [])
                ]}
              />
            </label>
          </div>

          {featuredListing ? (
            <section className="marketplace-spotlight">
              <div className="marketplace-spotlight-copy">
                <span className="hero-eyebrow">Top listing</span>
                <h3>{featuredListing.schoolName}</h3>
                <p>
                  {featuredListing.sport} • {featuredListing.level} •{" "}
                  {formatGameDate(featuredListing.dateISO)}
                </p>
              </div>
              <div className="marketplace-spotlight-metrics">
                <div>
                  <span>Posted pay</span>
                  <strong>{formatCurrency(featuredListing.payPosted)}</strong>
                </div>
                <div>
                  <span>Status</span>
                  <strong>{featuredListing.status}</strong>
                </div>
                <button type="button" onClick={() => handleOpenGameDetails(featuredListing)}>
                  View Listing
                </button>
              </div>
            </section>
          ) : null}

          <section className="game-list marketplace-game-list marketplace-game-list-list">
            {sortedGames.length === 0 ? (
              <div className="empty-state">No games match your filters.</div>
            ) : (
              sortedGames.map((game) => (
                <GameCard
                  key={game.id}
                  game={game}
                  bids={bids}
                  role={activeProfile.role}
                  currentUserId={activeUser.uid}
                  currentUserName={activeProfile.displayName}
                  availableCrews={officialCrews}
                  crewBidUnavailableReason={crewBidUnavailableReason}
                  userDistanceMiles={
                    activeProfile.role === "official"
                      ? distanceByGameId[game.id]
                      : null
                  }
                  distanceUnavailableLabel={noAddressDistanceLabel}
                  canManageGame={canPostGames && game.createdByUid === activeUser.uid}
                  onSubmitBid={handleSubmitBid}
                  onDeleteBid={handleDeleteBid}
                  onUpdateGame={handleUpdateGame}
                  layout="list"
                />
              ))
            )}
          </section>
        </section>
      </div>

      {modalMessage ? (
        <MessageModal
          title={modalMessage.title}
          message={modalMessage.message}
          onClose={() => setModalMessage(null)}
        />
      ) : null}
    </main>
  );
}

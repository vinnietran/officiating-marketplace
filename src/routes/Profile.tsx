import { useEffect, useMemo, useState, type FormEvent } from "react";
import {
  Award,
  BadgeCheck,
  BriefcaseBusiness,
  CalendarRange,
  LayoutGrid,
  LogOut,
  Mail,
  MapPin,
  ShieldCheck,
  Star,
  UserRound
} from "lucide-react";
import { Link } from "react-router-dom";
import { AuthPanel } from "../components/AuthPanel";
import { CompleteProfilePanel } from "../components/CompleteProfilePanel";
import { useAuth } from "../context/AuthContext";
import {
  isOfficialAssignedToAwardedMarketplaceGame,
  isOfficialAssignedToDirectGame
} from "../lib/gameAssignments";
import { FIRESTORE_DATABASE_ID } from "../lib/firebase";
import { getReadableFirestoreError } from "../lib/firebaseErrors";
import { formatCurrency, formatGameDate, getGameStatusLabel } from "../lib/format";
import {
  getUserProfile,
  subscribeBids,
  subscribeCrews,
  subscribeGames,
  subscribeRatings,
  updateOfficialProfile
} from "../lib/firestore";
import type { Bid, Crew, Game, OfficiatingLevel, Rating } from "../types";

const OFFICIATING_LEVEL_OPTIONS: OfficiatingLevel[] = [
  "Varsity",
  "Sub Varsity",
  "NCAA DI",
  "NCAA DII",
  "NCAA DIII"
];

function formatAccountCreatedAt(dateISO: string): string {
  const date = new Date(dateISO);
  if (Number.isNaN(date.getTime())) {
    return "Unknown";
  }

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric"
  }).format(date);
}

function formatRoleLabel(role: "official" | "assignor" | "school" | "evaluator"): string {
  if (role === "official") {
    return "Official";
  }
  if (role === "assignor") {
    return "Assignor";
  }
  if (role === "evaluator") {
    return "Evaluator";
  }
  return "School";
}

function getProfileInitials(name: string): string {
  const parts = name
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2);

  if (parts.length === 0) {
    return "OM";
  }

  return parts.map((part) => part[0]?.toUpperCase() ?? "").join("");
}

function formatRatingTargetLabel(rating: Rating): string {
  if (rating.targetType === "crew") {
    return "Crew";
  }
  if (rating.targetType === "official") {
    return "Official";
  }
  if (rating.targetType === "school") {
    return "School";
  }
  return "Venue";
}

export function Profile() {
  const { user, profile, loading, profileLoading, signOut } = useAuth();
  const [games, setGames] = useState<Game[]>([]);
  const [bids, setBids] = useState<Bid[]>([]);
  const [crews, setCrews] = useState<Crew[]>([]);
  const [ratings, setRatings] = useState<Rating[]>([]);
  const [dataError, setDataError] = useState<string | null>(null);
  const [signOutError, setSignOutError] = useState<string | null>(null);
  const [signingOut, setSigningOut] = useState(false);
  const [levelsOfficiated, setLevelsOfficiated] = useState<OfficiatingLevel[]>([]);
  const [addressLine1, setAddressLine1] = useState("");
  const [addressLine2, setAddressLine2] = useState("");
  const [city, setCity] = useState("");
  const [stateRegion, setStateRegion] = useState("");
  const [postalCode, setPostalCode] = useState("");
  const [profileSaveError, setProfileSaveError] = useState<string | null>(null);
  const [profileSaveSuccess, setProfileSaveSuccess] = useState<string | null>(null);
  const [savingProfileDetails, setSavingProfileDetails] = useState(false);

  useEffect(() => {
    if (!user) {
      setGames([]);
      setBids([]);
      setCrews([]);
      setRatings([]);
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
    const unsubscribeRatings = subscribeRatings(setRatings, (error) =>
      setDataError(getReadableFirestoreError(error, FIRESTORE_DATABASE_ID))
    );

    return () => {
      unsubscribeGames();
      unsubscribeBids();
      unsubscribeCrews();
      unsubscribeRatings();
    };
  }, [user]);

  useEffect(() => {
    if (!profile || profile.role !== "official") {
      setLevelsOfficiated([]);
      setAddressLine1("");
      setAddressLine2("");
      setCity("");
      setStateRegion("");
      setPostalCode("");
      return;
    }

    setLevelsOfficiated(profile.levelsOfficiated ?? []);
    setAddressLine1(profile.contactInfo?.addressLine1 ?? "");
    setAddressLine2(profile.contactInfo?.addressLine2 ?? "");
    setCity(profile.contactInfo?.city ?? "");
    setStateRegion(profile.contactInfo?.state ?? "");
    setPostalCode(profile.contactInfo?.postalCode ?? "");

    let cancelled = false;

    void getUserProfile(profile.uid)
      .then((freshProfile) => {
        if (cancelled || !freshProfile || freshProfile.role !== "official") {
          return;
        }

        setLevelsOfficiated(freshProfile.levelsOfficiated ?? []);
        setAddressLine1(freshProfile.contactInfo?.addressLine1 ?? "");
        setAddressLine2(freshProfile.contactInfo?.addressLine2 ?? "");
        setCity(freshProfile.contactInfo?.city ?? "");
        setStateRegion(freshProfile.contactInfo?.state ?? "");
        setPostalCode(freshProfile.contactInfo?.postalCode ?? "");
      })
      .catch(() => undefined);

    return () => {
      cancelled = true;
    };
  }, [profile]);

  const bidsById = useMemo(() => {
    const result = new Map<string, Bid>();
    bids.forEach((bid) => result.set(bid.id, bid));
    return result;
  }, [bids]);

  const crewsById = useMemo(() => {
    const result = new Map<string, Crew>();
    crews.forEach((crew) => result.set(crew.id, crew));
    return result;
  }, [crews]);

  const currentUserId = user?.uid ?? "";
  const currentUserBids = useMemo(
    () => bids.filter((bid) => bid.officialUid === currentUserId),
    [bids, currentUserId]
  );

  const gamesById = useMemo(() => {
    const result = new Map<string, Game>();
    games.forEach((game) => result.set(game.id, game));
    return result;
  }, [games]);

  const officialAwardedGames = useMemo(() => {
    if (!user || profile?.role !== "official") {
      return [];
    }

    return games
      .map((game) => {
        const selectedBid = game.selectedBidId ? bidsById.get(game.selectedBidId) : null;
        return {
          game,
          selectedBid: selectedBid ?? null
        };
      })
      .filter(
        (entry) => {
          if (entry.game.mode === "direct_assignment") {
            return (
              entry.game.status === "awarded" &&
              isOfficialAssignedToDirectGame(entry.game, currentUserId)
            );
          }

          return (
            entry.game.status === "awarded" &&
            isOfficialAssignedToAwardedMarketplaceGame(
              entry.selectedBid,
              crewsById,
              currentUserId
            )
          );
        }
      )
      .sort(
        (a, b) =>
          new Date(a.game.dateISO).getTime() - new Date(b.game.dateISO).getTime()
      );
  }, [games, bidsById, crewsById, currentUserId, profile?.role, user]);

  const officialOpenBidGameCount = useMemo(() => {
    const openGameIds = new Set(
      currentUserBids
        .map((bid) => gamesById.get(bid.gameId))
        .filter((game): game is Game => Boolean(game && game.status === "open"))
        .map((game) => game.id)
    );
    return openGameIds.size;
  }, [currentUserBids, gamesById]);

  const highestOfficialOffer = useMemo(() => {
    if (currentUserBids.length === 0) {
      return null;
    }
    return Math.max(...currentUserBids.map((bid) => bid.amount));
  }, [currentUserBids]);

  const postedGames = useMemo(() => {
    if (!user || (profile?.role !== "assignor" && profile?.role !== "school")) {
      return [];
    }

    return games
      .filter((game) => game.createdByUid === currentUserId)
      .sort(
        (a, b) =>
          new Date(a.dateISO).getTime() - new Date(b.dateISO).getTime()
      );
  }, [currentUserId, games, profile?.role, user]);

  const bidCountByGameId = useMemo(() => {
    const counts = new Map<string, number>();
    bids.forEach((bid) => {
      counts.set(bid.gameId, (counts.get(bid.gameId) ?? 0) + 1);
    });
    return counts;
  }, [bids]);

  const postedGamesBidCount = useMemo(
    () =>
      postedGames.reduce(
        (total, game) => total + (bidCountByGameId.get(game.id) ?? 0),
        0
      ),
    [postedGames, bidCountByGameId]
  );

  const officialCrewIds = useMemo(() => {
    if (profile?.role !== "official") {
      return [];
    }

    return crews
      .filter((crew) => crew.memberUids.includes(currentUserId))
      .map((crew) => crew.id);
  }, [crews, currentUserId, profile?.role]);

  const officialReceivedRatings = useMemo(() => {
    if (profile?.role !== "official") {
      return [];
    }

    const crewIdSet = new Set(officialCrewIds);
    return ratings.filter((rating) => {
      if (rating.targetType === "official") {
        return rating.targetId === currentUserId;
      }
      return crewIdSet.has(rating.targetId);
    });
  }, [currentUserId, officialCrewIds, profile?.role, ratings]);

  const averageRating = useMemo(() => {
    const source = profile?.role === "official" ? officialReceivedRatings : [];
    if (source.length === 0) {
      return null;
    }
    const total = source.reduce((sum, rating) => sum + rating.stars, 0);
    return total / source.length;
  }, [officialReceivedRatings, profile?.role]);

  const fiveStarRatingCount = useMemo(() => {
    const source = profile?.role === "official" ? officialReceivedRatings : [];
    return source.filter((rating) => rating.stars === 5).length;
  }, [officialReceivedRatings, profile?.role]);

  const mostRecentRating = useMemo(() => {
    const source = profile?.role === "official" ? officialReceivedRatings : [];
    if (source.length === 0) {
      return null;
    }
    return [...source].sort((a, b) => b.updatedAtISO.localeCompare(a.updatedAtISO))[0];
  }, [officialReceivedRatings, profile?.role]);

  const submittedRatings = useMemo(() => {
    if (profile?.role !== "assignor" && profile?.role !== "school") {
      return [];
    }
    return ratings.filter((rating) => rating.ratedByUid === currentUserId);
  }, [currentUserId, profile?.role, ratings]);

  const recentRoleRatings = useMemo(() => {
    const source =
      profile?.role === "official" ? officialReceivedRatings : submittedRatings;
    return [...source].sort((a, b) => b.updatedAtISO.localeCompare(a.updatedAtISO)).slice(0, 4);
  }, [officialReceivedRatings, profile?.role, submittedRatings]);

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
          <h1>Profile</h1>
          <p>Sign in to view your profile.</p>
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
          <h1>Profile</h1>
        </header>
        <CompleteProfilePanel />
      </main>
    );
  }

  const roleLabel = formatRoleLabel(profile.role);
  const isOfficial = profile.role === "official";
  const isManager = profile.role === "assignor" || profile.role === "school";
  const initials = getProfileInitials(profile.displayName);
  const locationSummary = [addressLine1, addressLine2, city, stateRegion, postalCode]
    .map((value) => value.trim())
    .filter(Boolean)
    .join(", ");
  const levelsSummary = levelsOfficiated.length > 0 ? levelsOfficiated.join(", ") : "No levels saved yet";
  const roleDescription = isOfficial
    ? "Track assignments, sharpen your profile details, and watch how schools and evaluators rate your work."
    : isManager
      ? "Monitor the assignments you post, the response they receive, and the ratings you have submitted."
      : "Review assignment activity, evaluations, and crew performance from one control point.";
  const profileMetrics = isOfficial
    ? [
        {
          label: "Active bids",
          value: String(currentUserBids.length),
          detail: `${officialOpenBidGameCount} still open`,
          tone: "blue"
        },
        {
          label: "Awarded games",
          value: String(officialAwardedGames.length),
          detail: "Confirmed assignments",
          tone: "mint"
        },
        {
          label: "Average rating",
          value: averageRating === null ? "-" : averageRating.toFixed(2),
          detail: `${officialReceivedRatings.length} ratings received`,
          tone: "gold"
        },
        {
          label: "Top offer",
          value: highestOfficialOffer === null ? "-" : formatCurrency(highestOfficialOffer),
          detail: "Highest active bid",
          tone: "rose"
        }
      ]
    : [
        {
          label: "Games posted",
          value: String(postedGames.length),
          detail: `${postedGames.filter((game) => game.status === "open").length} still open`,
          tone: "blue"
        },
        {
          label: "Awarded games",
          value: String(postedGames.filter((game) => game.status === "awarded").length),
          detail: "Closed assignments",
          tone: "mint"
        },
        {
          label: "Bids received",
          value: String(postedGamesBidCount),
          detail: "Across your postings",
          tone: "gold"
        },
        {
          label: "Ratings activity",
          value: String(submittedRatings.length),
          detail: "Ratings submitted",
          tone: "rose"
        }
      ];
  const spotlightItems = isOfficial
    ? officialAwardedGames.slice(0, 3).map(({ game, selectedBid }) => ({
        id: game.id,
        title: game.schoolName,
        meta: `${game.sport} • ${game.level}`,
        date: formatGameDate(game.dateISO),
        detail:
          selectedBid ? formatCurrency(selectedBid.amount) : formatCurrency(game.payPosted),
        tone: game.status === "awarded" ? "blue" : "mint"
      }))
    : postedGames.slice(0, 3).map((game) => ({
        id: game.id,
        title: game.schoolName,
        meta: `${game.sport} • ${game.level}`,
        date: formatGameDate(game.dateISO),
        detail: `${bidCountByGameId.get(game.id) ?? 0} bids`,
        tone: game.status === "awarded" ? "mint" : "gold"
      }));
  const detailRows = [
    {
      label: "Full Name",
      value: profile.displayName,
      icon: UserRound
    },
    {
      label: "Email",
      value: profile.email,
      icon: Mail
    },
    {
      label: "Role",
      value: roleLabel,
      icon: ShieldCheck
    },
    {
      label: "Member Since",
      value: formatAccountCreatedAt(profile.createdAtISO),
      icon: CalendarRange
    },
    ...(isOfficial
      ? [
          {
            label: "Base Location",
            value: locationSummary || "Add address details for better matching",
            icon: MapPin
          },
          {
            label: "Levels Officiated",
            value: levelsSummary,
            icon: BadgeCheck
          }
        ]
      : [])
  ];

  async function handleSignOut() {
    setSignOutError(null);
    setSigningOut(true);
    try {
      await signOut();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to sign out.";
      setSignOutError(message);
    } finally {
      setSigningOut(false);
    }
  }

  function handleToggleOfficiatingLevel(level: OfficiatingLevel) {
    setLevelsOfficiated((currentLevels) => {
      if (currentLevels.includes(level)) {
        return currentLevels.filter((currentLevel) => currentLevel !== level);
      }
      return [...currentLevels, level];
    });
  }

  async function handleSaveOfficialProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!profile || profile.role !== "official") {
      return;
    }

    setProfileSaveError(null);
    setProfileSaveSuccess(null);
    setSavingProfileDetails(true);

    try {
      await updateOfficialProfile(profile.uid, {
        levelsOfficiated,
        contactInfo: {
          addressLine1,
          addressLine2,
          city,
          state: stateRegion,
          postalCode
        }
      });

      setProfileSaveSuccess("Official details saved.");
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unable to save official details.";
      setProfileSaveError(message);
    } finally {
      setSavingProfileDetails(false);
    }
  }

  return (
    <main className="page profile-page">
      <section className="profile-dashboard">
        <div className="profile-dashboard-header">
          <div>
            <span className="hero-eyebrow">My Profile</span>
            <h1>{profile.displayName}</h1>
            <p>{roleDescription}</p>
          </div>
          <div className="profile-dashboard-actions">
            <span className="hero-badge">{roleLabel}</span>
            <span className="hero-badge">
              Member since {formatAccountCreatedAt(profile.createdAtISO)}
            </span>
          </div>
        </div>

        {dataError ? <p className="error-text">{dataError}</p> : null}

        <section className="profile-shell">
          <div className="profile-sidebar-column">
            <article className="profile-hero-card">
              <div className="profile-hero-head">
                <div className="profile-hero-avatar">{initials}</div>
                <div className="profile-hero-copy">
                  <h2>{profile.displayName}</h2>
                  <p>{roleLabel}</p>
                </div>
              </div>
              <div className="profile-hero-badges">
                <span className="profile-role-pill">{roleLabel}</span>
                <span className="profile-role-pill profile-role-pill-muted">
                  {profile.email}
                </span>
              </div>
              <p className="profile-hero-description">{roleDescription}</p>
              {signOutError ? <p className="error-text">{signOutError}</p> : null}
              <div className="profile-actions profile-actions-hero">
                <Link to="/marketplace" className="ui-button ui-button-secondary ui-button-link">
                  <LayoutGrid /> Marketplace
                </Link>
                <Link to="/schedule" className="ui-button ui-button-secondary ui-button-link">
                  <CalendarRange /> Schedule
                </Link>
                <button
                  type="button"
                  className="ui-button ui-button-secondary ui-button-link"
                  onClick={handleSignOut}
                  disabled={signingOut}
                >
                  <LogOut />
                  {signingOut ? "Signing Out..." : "Sign Out"}
                </button>
              </div>
            </article>

            <article className="profile-side-card">
              <div className="profile-card-heading">
                <h3>Detailed Information</h3>
                <span className="profile-card-chip">Live profile</span>
              </div>
              <div className="profile-detail-list">
                {detailRows.map((row) => {
                  const Icon = row.icon;
                  return (
                    <div key={row.label} className="profile-detail-row">
                      <span className="profile-detail-icon" aria-hidden="true">
                        <Icon />
                      </span>
                      <div className="profile-detail-copy">
                        <span>{row.label}</span>
                        <strong>{row.value}</strong>
                      </div>
                    </div>
                  );
                })}
              </div>
            </article>

            {isOfficial ? (
              <article className="profile-side-card">
                <div className="profile-card-heading">
                  <h3>Official Details</h3>
                  <span className="profile-card-chip">Editable</span>
                </div>
                <p className="meta-line">
                  Keep this current so assignment matching and distance ranking improve over time.
                </p>

                <form className="profile-details-form" onSubmit={handleSaveOfficialProfile}>
                  <div className="profile-levels-grid">
                    {OFFICIATING_LEVEL_OPTIONS.map((levelOption) => {
                      const isChecked = levelsOfficiated.includes(levelOption);
                      return (
                        <label key={levelOption} className="profile-level-option">
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={() => handleToggleOfficiatingLevel(levelOption)}
                          />
                          <span>{levelOption}</span>
                        </label>
                      );
                    })}
                  </div>

                  <label>
                    Address Line 1
                    <input
                      type="text"
                      value={addressLine1}
                      onChange={(event) => setAddressLine1(event.target.value)}
                      placeholder="123 Main St"
                    />
                  </label>

                  <label>
                    Address Line 2 (Optional)
                    <input
                      type="text"
                      value={addressLine2}
                      onChange={(event) => setAddressLine2(event.target.value)}
                      placeholder="Apt, Suite, Unit"
                    />
                  </label>

                  <div className="profile-address-grid">
                    <label>
                      City
                      <input
                        type="text"
                        value={city}
                        onChange={(event) => setCity(event.target.value)}
                        placeholder="City"
                      />
                    </label>

                    <label>
                      State
                      <input
                        type="text"
                        value={stateRegion}
                        onChange={(event) => setStateRegion(event.target.value)}
                        placeholder="State"
                      />
                    </label>

                    <label>
                      ZIP
                      <input
                        type="text"
                        value={postalCode}
                        onChange={(event) => setPostalCode(event.target.value)}
                        placeholder="ZIP code"
                      />
                    </label>
                  </div>

                  {profileSaveError ? <p className="error-text">{profileSaveError}</p> : null}
                  {profileSaveSuccess ? <p className="hint-text">{profileSaveSuccess}</p> : null}

                  <div className="profile-actions">
                    <button type="submit" disabled={savingProfileDetails}>
                      {savingProfileDetails ? "Saving..." : "Save Official Details"}
                    </button>
                  </div>
                </form>
              </article>
            ) : null}
          </div>

          <div className="profile-main-column">
            <article className="profile-main-card profile-main-card-hero">
              <div className="profile-card-heading">
                <div>
                  <h3>{isOfficial ? "Performance Snapshot" : `${roleLabel} Snapshot`}</h3>
                  <p className="meta-line">
                    A role-specific view of your current activity, outcomes, and profile readiness.
                  </p>
                </div>
                <span className="profile-card-chip">
                  {isOfficial ? "Assignment View" : "Operations View"}
                </span>
              </div>
              <div className="profile-metric-grid">
                {profileMetrics.map((metric) => (
                  <article
                    key={metric.label}
                    className={`profile-metric-card profile-metric-card-${metric.tone}`}
                  >
                    <span className="profile-metric-label">{metric.label}</span>
                    <strong className="profile-metric-value">{metric.value}</strong>
                    <span className="profile-metric-detail">{metric.detail}</span>
                  </article>
                ))}
              </div>
            </article>

            <div className="profile-feature-grid">
              <article className="profile-main-card">
                <div className="profile-card-heading">
                  <div>
                    <h3>{isOfficial ? "Upcoming Assignments" : "Recent Posted Games"}</h3>
                    <p className="meta-line">
                      {isOfficial
                        ? "The next games currently tied to your profile."
                        : "The games your organization has most recently put into market."}
                    </p>
                  </div>
                  <span className="profile-card-chip">
                    {isOfficial ? officialAwardedGames.length : postedGames.length} total
                  </span>
                </div>
                {spotlightItems.length === 0 ? (
                  <p className="empty-text">
                    {isOfficial ? "No awarded games yet." : "No posted games yet."}
                  </p>
                ) : (
                  <div className="profile-spotlight-grid">
                    {spotlightItems.map((item) => (
                      <article
                        key={item.id}
                        className={`profile-spotlight-card profile-spotlight-card-${item.tone}`}
                      >
                        <span className="profile-spotlight-date">{item.date}</span>
                        <strong>{item.title}</strong>
                        <p>{item.meta}</p>
                        <span className="profile-spotlight-footer">{item.detail}</span>
                      </article>
                    ))}
                  </div>
                )}
              </article>

              <article className="profile-main-card">
                <div className="profile-card-heading">
                  <div>
                    <h3>Ratings Lens</h3>
                    <p className="meta-line">
                      {isOfficial
                        ? "How your recent ratings are trending across assignments."
                        : "A quick look at the ratings activity tied to your account."}
                    </p>
                  </div>
                  <span className="profile-card-chip">
                    {isOfficial ? officialReceivedRatings.length : submittedRatings.length} entries
                  </span>
                </div>
                <div className="profile-ratings-summary">
                  <div className="profile-ratings-score">
                    <Star />
                    <strong>{averageRating === null ? "-" : averageRating.toFixed(2)}</strong>
                    <span>{isOfficial ? "average received" : "average shown when applicable"}</span>
                  </div>
                  <div className="profile-ratings-kpis">
                    <div>
                      <span>5-Star Ratings</span>
                      <strong>{fiveStarRatingCount}</strong>
                    </div>
                    <div>
                      <span>Most Recent</span>
                      <strong>{mostRecentRating ? `${mostRecentRating.stars}/5` : "-"}</strong>
                    </div>
                    <div>
                      <span>
                        {isOfficial ? "Ratings Received" : "Ratings Submitted"}
                      </span>
                      <strong>{isOfficial ? officialReceivedRatings.length : submittedRatings.length}</strong>
                    </div>
                  </div>
                </div>

                {recentRoleRatings.length === 0 ? (
                  <p className="empty-text">No ratings yet.</p>
                ) : (
                  <div className="profile-rating-feed">
                    {recentRoleRatings.map((rating) => (
                      <div key={rating.id} className="profile-rating-feed-item">
                        <div className="profile-rating-feed-head">
                          <span>{formatRatingTargetLabel(rating)}</span>
                          <strong>{rating.stars}/5</strong>
                        </div>
                        <p>{rating.comment ?? "No written notes attached to this rating."}</p>
                        <span className="profile-rating-feed-date">
                          {formatGameDate(rating.updatedAtISO)}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </article>
            </div>

            <article className="profile-main-card">
              <div className="profile-card-heading">
                <div>
                  <h3>{isOfficial ? "Assignment Table" : "Operations Table"}</h3>
                  <p className="meta-line">
                    {isOfficial
                      ? "A detailed list of awarded games tied to your profile."
                      : "A sortable-style table of the assignments your account owns."}
                  </p>
                </div>
                <span className="profile-card-chip">
                  {isOfficial ? <BriefcaseBusiness /> : <Award />}
                  {isOfficial ? "Assignments" : "Posted games"}
                </span>
              </div>
              {isOfficial ? (
                officialAwardedGames.length === 0 ? (
                  <p className="empty-text">No awarded games yet.</p>
                ) : (
                  <div className="profile-table-wrapper">
                    <table className="profile-table">
                      <thead>
                        <tr>
                          <th>Date/Time</th>
                          <th>School</th>
                          <th>Sport/Level</th>
                          <th>Location</th>
                          <th>Fee</th>
                        </tr>
                      </thead>
                      <tbody>
                        {officialAwardedGames.slice(0, 8).map(({ game, selectedBid }) => (
                          <tr key={game.id}>
                            <td>{formatGameDate(game.dateISO)}</td>
                            <td>{game.schoolName}</td>
                            <td>
                              {game.sport} • {game.level}
                            </td>
                            <td>{game.location}</td>
                            <td>
                              {selectedBid
                                ? formatCurrency(selectedBid.amount)
                                : formatCurrency(game.payPosted)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )
              ) : postedGames.length === 0 ? (
                <p className="empty-text">No posted games yet.</p>
              ) : (
                <div className="profile-table-wrapper">
                  <table className="profile-table">
                    <thead>
                      <tr>
                        <th>Date/Time</th>
                        <th>School</th>
                        <th>Sport/Level</th>
                        <th>Status</th>
                        <th>Total Bids</th>
                      </tr>
                    </thead>
                    <tbody>
                      {postedGames.slice(0, 8).map((game) => (
                        <tr key={game.id}>
                          <td>{formatGameDate(game.dateISO)}</td>
                          <td>{game.schoolName}</td>
                          <td>
                            {game.sport} • {game.level}
                          </td>
                          <td>{getGameStatusLabel(game.status, game.mode)}</td>
                          <td>{bidCountByGameId.get(game.id) ?? 0}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </article>
          </div>
        </section>
      </section>
    </main>
  );
}

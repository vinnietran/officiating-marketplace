import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { AuthPanel } from "../components/AuthPanel";
import { CompleteProfilePanel } from "../components/CompleteProfilePanel";
import { PageHeader } from "../components/ui/PageHeader";
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
    <main className="page">
      <PageHeader
        eyebrow="Account and performance"
        title="Profile"
        description="Account details, activity metrics, and profile settings for your role."
        badges={
          <>
            <span className="hero-badge">{roleLabel}</span>
            <span className="hero-badge">
              Member since {formatAccountCreatedAt(profile.createdAtISO)}
            </span>
          </>
        }
        stats={[
          {
            label: profile.role === "official" ? "Total Bids" : "Games Posted",
            value: profile.role === "official" ? currentUserBids.length : postedGames.length
          },
          {
            label: profile.role === "official" ? "Awarded Games" : "Bids Received",
            value:
              profile.role === "official" ? officialAwardedGames.length : postedGamesBidCount
          },
          {
            label: "Average Rating",
            value: averageRating === null ? "-" : averageRating.toFixed(2)
          }
        ]}
      />

      {dataError ? <p className="error-text">{dataError}</p> : null}

      <section className="profile-layout">
        <article className="profile-panel">
          <h3>Account</h3>
          <p className="meta-line">
            <strong>Name:</strong> {profile.displayName}
          </p>
          <p className="meta-line">
            <strong>Email:</strong> {profile.email}
          </p>
          <p className="meta-line">
            <strong>Role:</strong> {roleLabel}
          </p>
          <p className="meta-line">
            <strong>Member Since:</strong> {formatAccountCreatedAt(profile.createdAtISO)}
          </p>
          {signOutError ? <p className="error-text">{signOutError}</p> : null}

          <div className="profile-actions">
            <button
              type="button"
              className="button-secondary"
              onClick={handleSignOut}
              disabled={signingOut}
            >
              {signingOut ? "Signing Out..." : "Sign Out"}
            </button>
            <Link to="/marketplace" className="button-secondary details-back-link">
              Go to Marketplace
            </Link>
            <Link to="/schedule" className="button-secondary details-back-link">
              Go to Schedule
            </Link>
          </div>
        </article>

        {profile.role === "official" ? (
          <article className="profile-panel">
            <h3>Official Details</h3>
            <p className="meta-line">
              Add levels officiated and address details for upcoming smart matching.
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
              {profileSaveSuccess ? (
                <p className="hint-text">{profileSaveSuccess}</p>
              ) : null}

              <div className="profile-actions">
                <button type="submit" disabled={savingProfileDetails}>
                  {savingProfileDetails ? "Saving..." : "Save Official Details"}
                </button>
              </div>
            </form>
          </article>
        ) : null}

        {profile.role === "official" ? (
          <article className="profile-panel">
            <h3>Official Snapshot</h3>
            <div className="profile-stats-grid">
              <div className="profile-stat">
                <span className="profile-stat-label">Total Bids</span>
                <strong className="profile-stat-value">{currentUserBids.length}</strong>
              </div>
              <div className="profile-stat">
                <span className="profile-stat-label">Open Bid Games</span>
                <strong className="profile-stat-value">{officialOpenBidGameCount}</strong>
              </div>
              <div className="profile-stat">
                <span className="profile-stat-label">Awarded Games</span>
                <strong className="profile-stat-value">{officialAwardedGames.length}</strong>
              </div>
              <div className="profile-stat">
                <span className="profile-stat-label">Highest Offer</span>
                <strong className="profile-stat-value">
                  {highestOfficialOffer === null
                    ? "-"
                    : formatCurrency(highestOfficialOffer)}
                </strong>
              </div>
            </div>

            <h4>Upcoming Assignments</h4>
            {officialAwardedGames.length === 0 ? (
              <p className="empty-text">No awarded games yet.</p>
            ) : (
              <ul className="profile-list">
                {officialAwardedGames.slice(0, 5).map(({ game, selectedBid }) => (
                  <li key={game.id} className="profile-list-item">
                    <div>
                      <strong>{game.schoolName}</strong> • {game.sport} • {game.level}
                    </div>
                    <div>{formatGameDate(game.dateISO)}</div>
                    <div>{game.location}</div>
                    <div>
                      Assigned by {game.createdByName ?? game.createdByRole} •{" "}
                      {selectedBid
                        ? formatCurrency(selectedBid.amount)
                        : formatCurrency(game.payPosted)}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </article>
        ) : (
          <article className="profile-panel">
            <h3>{roleLabel} Snapshot</h3>
            <div className="profile-stats-grid">
              <div className="profile-stat">
                <span className="profile-stat-label">Games Posted</span>
                <strong className="profile-stat-value">{postedGames.length}</strong>
              </div>
              <div className="profile-stat">
                <span className="profile-stat-label">Open Games</span>
                <strong className="profile-stat-value">
                  {postedGames.filter((game) => game.status === "open").length}
                </strong>
              </div>
              <div className="profile-stat">
                <span className="profile-stat-label">Awarded Games</span>
                <strong className="profile-stat-value">
                  {postedGames.filter((game) => game.status === "awarded").length}
                </strong>
              </div>
              <div className="profile-stat">
                <span className="profile-stat-label">Total Bids Received</span>
                <strong className="profile-stat-value">{postedGamesBidCount}</strong>
              </div>
            </div>

            <h4>Recent Posted Games</h4>
            {postedGames.length === 0 ? (
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
        )}

        <article className="profile-panel">
          <h3>Ratings</h3>
          <div className="profile-stats-grid">
            <div className="profile-stat">
              <span className="profile-stat-label">Average Rating</span>
              <strong className="profile-stat-value">
                {averageRating === null ? "-" : averageRating.toFixed(2)}
              </strong>
            </div>
            <div className="profile-stat">
              <span className="profile-stat-label">
                {profile.role === "official" ? "Ratings Received" : "Ratings Submitted"}
              </span>
              <strong className="profile-stat-value">
                {profile.role === "official"
                  ? officialReceivedRatings.length
                  : submittedRatings.length}
              </strong>
            </div>
            <div className="profile-stat">
              <span className="profile-stat-label">5-Star Ratings</span>
              <strong className="profile-stat-value">{fiveStarRatingCount}</strong>
            </div>
            <div className="profile-stat">
              <span className="profile-stat-label">Most Recent Rating</span>
              <strong className="profile-stat-value">
                {mostRecentRating ? `${mostRecentRating.stars}/5` : "-"}
              </strong>
            </div>
          </div>
          {mostRecentRating ? (
            <>
              <p className="meta-line">
                <strong>Updated:</strong> {formatGameDate(mostRecentRating.updatedAtISO)}
              </p>
            </>
          ) : (
            <p className="meta-line">No ratings yet.</p>
          )}
        </article>
      </section>
    </main>
  );
}

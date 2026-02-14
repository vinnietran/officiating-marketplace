import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { AuthPanel } from "../components/AuthPanel";
import { CompleteProfilePanel } from "../components/CompleteProfilePanel";
import { useAuth } from "../context/AuthContext";
import { FIRESTORE_DATABASE_ID } from "../lib/firebase";
import { getReadableFirestoreError } from "../lib/firebaseErrors";
import { formatCurrency, formatGameDate } from "../lib/format";
import { subscribeBids, subscribeGames } from "../lib/firestore";
import type { Bid, Game } from "../types";

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

function formatRoleLabel(role: "official" | "assignor" | "school"): string {
  if (role === "official") {
    return "Official";
  }
  if (role === "assignor") {
    return "Assignor";
  }
  return "School";
}

export function Profile() {
  const { user, profile, loading, profileLoading } = useAuth();
  const [games, setGames] = useState<Game[]>([]);
  const [bids, setBids] = useState<Bid[]>([]);
  const [dataError, setDataError] = useState<string | null>(null);

  useEffect(() => {
    if (!user) {
      setGames([]);
      setBids([]);
      return;
    }

    const unsubscribeGames = subscribeGames(setGames, (error) =>
      setDataError(getReadableFirestoreError(error, FIRESTORE_DATABASE_ID))
    );
    const unsubscribeBids = subscribeBids(setBids, (error) =>
      setDataError(getReadableFirestoreError(error, FIRESTORE_DATABASE_ID))
    );

    return () => {
      unsubscribeGames();
      unsubscribeBids();
    };
  }, [user]);

  const bidsById = useMemo(() => {
    const result = new Map<string, Bid>();
    bids.forEach((bid) => result.set(bid.id, bid));
    return result;
  }, [bids]);

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
        (entry) =>
          entry.game.status === "awarded" &&
          entry.selectedBid?.officialUid === currentUserId
      )
      .sort(
        (a, b) =>
          new Date(a.game.dateISO).getTime() - new Date(b.game.dateISO).getTime()
      );
  }, [games, bidsById, currentUserId, profile?.role, user]);

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

  return (
    <main className="page">
      <header className="hero">
        <h1>Profile</h1>
        <p>Account details and quick stats for your marketplace activity.</p>
      </header>

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
          <p className="meta-line">
            <strong>User ID:</strong> {profile.uid}
          </p>

          <div className="profile-actions">
            <Link to="/" className="button-secondary details-back-link">
              Go to Marketplace
            </Link>
            <Link to="/schedule" className="button-secondary details-back-link">
              Go to Schedule
            </Link>
          </div>
        </article>

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
                      {selectedBid ? formatCurrency(selectedBid.amount) : "-"}
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
                        <td>{game.status === "awarded" ? "Awarded" : "Open"}</td>
                        <td>{bidCountByGameId.get(game.id) ?? 0}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </article>
        )}
      </section>
    </main>
  );
}

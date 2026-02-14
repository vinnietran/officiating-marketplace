import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { CompleteProfilePanel } from "../components/CompleteProfilePanel";
import { useAuth } from "../context/AuthContext";
import { FIRESTORE_DATABASE_ID } from "../lib/firebase";
import { getReadableFirestoreError } from "../lib/firebaseErrors";
import { formatCurrency, formatGameDate, getBidWindowInfo } from "../lib/format";
import { subscribeBids, subscribeGames } from "../lib/firestore";
import type { Bid, Game } from "../types";

interface DashboardRow {
  game: Game;
  bidCount: number;
  highestBid: number | null;
  bidWindowLabel: string;
  bidWindowState: "open" | "closing" | "closed" | "unset";
}

function isNonOfficialRole(role: string | undefined): role is "assignor" | "school" {
  return role === "assignor" || role === "school";
}

export function Dashboard() {
  const { user, profile, loading, profileLoading } = useAuth();
  const [games, setGames] = useState<Game[]>([]);
  const [bids, setBids] = useState<Bid[]>([]);
  const [dataError, setDataError] = useState<string | null>(null);
  const [nowMs, setNowMs] = useState(() => Date.now());

  useEffect(() => {
    const timerId = window.setInterval(() => setNowMs(Date.now()), 60000);
    return () => window.clearInterval(timerId);
  }, []);

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

  const myGames = useMemo(() => {
    if (!user || !isNonOfficialRole(profile?.role)) {
      return [];
    }

    return games
      .filter((game) => game.createdByUid === user.uid)
      .sort((a, b) => new Date(a.dateISO).getTime() - new Date(b.dateISO).getTime());
  }, [games, profile?.role, user]);

  const bidStatsByGameId = useMemo(() => {
    const result = new Map<string, { bidCount: number; highestBid: number | null }>();

    bids.forEach((bid) => {
      const current = result.get(bid.gameId) ?? { bidCount: 0, highestBid: null };
      const nextHighest =
        current.highestBid === null ? bid.amount : Math.max(current.highestBid, bid.amount);
      result.set(bid.gameId, {
        bidCount: current.bidCount + 1,
        highestBid: nextHighest
      });
    });

    return result;
  }, [bids]);

  const openGamesCount = myGames.filter((game) => game.status === "open").length;
  const awardedGamesCount = myGames.filter((game) => game.status === "awarded").length;
  const upcomingGamesCount = myGames.filter(
    (game) => new Date(game.dateISO).getTime() >= nowMs
  ).length;

  const needsActionRows = useMemo<DashboardRow[]>(() => {
    return myGames
      .filter((game) => game.status === "open")
      .map((game) => {
        const stats = bidStatsByGameId.get(game.id) ?? { bidCount: 0, highestBid: null };
        const bidWindowInfo = getBidWindowInfo(game.acceptingBidsUntilISO, game.status, nowMs);

        return {
          game,
          bidCount: stats.bidCount,
          highestBid: stats.highestBid,
          bidWindowLabel: bidWindowInfo.label,
          bidWindowState: bidWindowInfo.state
        };
      })
      .sort((a, b) => {
        const aTime = a.game.acceptingBidsUntilISO
          ? new Date(a.game.acceptingBidsUntilISO).getTime()
          : Number.MAX_SAFE_INTEGER;
        const bTime = b.game.acceptingBidsUntilISO
          ? new Date(b.game.acceptingBidsUntilISO).getTime()
          : Number.MAX_SAFE_INTEGER;
        return aTime - bTime;
      })
      .slice(0, 8);
  }, [bidStatsByGameId, myGames, nowMs]);

  const upcomingRows = useMemo<DashboardRow[]>(() => {
    return myGames
      .filter((game) => new Date(game.dateISO).getTime() >= nowMs)
      .map((game) => {
        const stats = bidStatsByGameId.get(game.id) ?? { bidCount: 0, highestBid: null };
        const bidWindowInfo = getBidWindowInfo(game.acceptingBidsUntilISO, game.status, nowMs);

        return {
          game,
          bidCount: stats.bidCount,
          highestBid: stats.highestBid,
          bidWindowLabel: bidWindowInfo.label,
          bidWindowState: bidWindowInfo.state
        };
      })
      .slice(0, 10);
  }, [bidStatsByGameId, myGames, nowMs]);

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
          <h1>Dashboard</h1>
          <p>Sign in to view your operations dashboard.</p>
        </header>
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
          <h1>Dashboard</h1>
        </header>
        <CompleteProfilePanel />
      </main>
    );
  }

  if (!isNonOfficialRole(profile.role)) {
    return (
      <main className="page">
        <header className="hero">
          <h1>Dashboard</h1>
          <p>This page is available to assignors and schools.</p>
        </header>
        <Link to="/marketplace">Go to Marketplace</Link>
      </main>
    );
  }

  return (
    <main className="page">
      <header className="hero">
        <h1>Operations Dashboard</h1>
        <p>Track games needing action and upcoming assignments.</p>
      </header>

      <section className="dashboard-actions">
        <Link to="/post-game" className="nav-link active">
          Post a Game
        </Link>
        <Link to="/assign-game" className="nav-link active">
          Assign Game
        </Link>
        <Link to="/schedule" className="button-secondary dashboard-link-button">
          View Full Schedule
        </Link>
      </section>

      <section className="dashboard-kpis">
        <article className="dashboard-kpi-card">
          <span className="dashboard-kpi-label">Open Games</span>
          <strong className="dashboard-kpi-value">{openGamesCount}</strong>
        </article>
        <article className="dashboard-kpi-card">
          <span className="dashboard-kpi-label">Awarded Games</span>
          <strong className="dashboard-kpi-value">{awardedGamesCount}</strong>
        </article>
        <article className="dashboard-kpi-card">
          <span className="dashboard-kpi-label">Upcoming</span>
          <strong className="dashboard-kpi-value">{upcomingGamesCount}</strong>
        </article>
      </section>

      {dataError ? <p className="error-text">{dataError}</p> : null}

      <section className="dashboard-panel">
        <div className="results-header">
          <h2>Needs Action</h2>
          <span>{needsActionRows.length} game(s)</span>
        </div>

        {needsActionRows.length === 0 ? (
          <p className="empty-state">No open games need attention right now.</p>
        ) : (
          <div className="schedule-table-wrapper">
            <table className="schedule-table">
              <thead>
                <tr>
                  <th>Date/Time</th>
                  <th>School</th>
                  <th>Sport/Level</th>
                  <th>Bid Window</th>
                  <th>Total Bids</th>
                  <th>Highest Bid</th>
                  <th>Details</th>
                </tr>
              </thead>
              <tbody>
                {needsActionRows.map((row) => (
                  <tr key={row.game.id}>
                    <td>{formatGameDate(row.game.dateISO)}</td>
                    <td>{row.game.schoolName}</td>
                    <td>
                      {row.game.sport} • {row.game.level}
                    </td>
                    <td>
                      <span className={`bid-window-label bid-window-${row.bidWindowState}`}>
                        {row.bidWindowLabel}
                      </span>
                    </td>
                    <td>{row.bidCount}</td>
                    <td>{row.highestBid === null ? "-" : formatCurrency(row.highestBid)}</td>
                    <td>
                      <Link to={`/schedule/games/${row.game.id}`}>Open</Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="dashboard-panel">
        <div className="results-header">
          <h2>Upcoming Games</h2>
          <span>{upcomingRows.length} game(s)</span>
        </div>

        {upcomingRows.length === 0 ? (
          <p className="empty-state">No upcoming games posted yet.</p>
        ) : (
          <div className="schedule-table-wrapper">
            <table className="schedule-table">
              <thead>
                <tr>
                  <th>Date/Time</th>
                  <th>School</th>
                  <th>Sport/Level</th>
                  <th>Status</th>
                  <th>Total Bids</th>
                  <th>Highest Bid</th>
                  <th>Details</th>
                </tr>
              </thead>
              <tbody>
                {upcomingRows.map((row) => (
                  <tr key={row.game.id}>
                    <td>{formatGameDate(row.game.dateISO)}</td>
                    <td>{row.game.schoolName}</td>
                    <td>
                      {row.game.sport} • {row.game.level}
                    </td>
                    <td>{row.game.status === "awarded" ? "Awarded" : "Open"}</td>
                    <td>{row.bidCount}</td>
                    <td>{row.highestBid === null ? "-" : formatCurrency(row.highestBid)}</td>
                    <td>
                      <Link to={`/schedule/games/${row.game.id}`}>Open</Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  );
}

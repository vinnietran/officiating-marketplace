import { useEffect, useMemo, useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { CompleteProfilePanel } from "../components/CompleteProfilePanel";
import { ButtonLink } from "../components/ui/ButtonLink";
import { PageHeader } from "../components/ui/PageHeader";
import { SectionHeader } from "../components/ui/SectionHeader";
import { useAuth } from "../context/AuthContext";
import {
  getOfficialAssignmentDetails,
  isOfficialAssignedToAwardedMarketplaceGame,
  isOfficialAssignedToDirectGame
} from "../lib/gameAssignments";
import { FIRESTORE_DATABASE_ID } from "../lib/firebase";
import { getReadableFirestoreError } from "../lib/firebaseErrors";
import {
  formatCurrency,
  formatGameDate,
  getBidWindowInfo,
  getGameStatusLabel
} from "../lib/format";
import { subscribeBids, subscribeCrews, subscribeGames } from "../lib/firestore";
import type { Bid, Crew, Game } from "../types";

interface OperationsDashboardRow {
  game: Game;
  bidCount: number;
  highestBid: number | null;
  bidWindowLabel: string;
  bidWindowState: "open" | "closing" | "closed" | "unset";
}

interface OfficialOpenBidRow {
  game: Game;
  bidCount: number;
  highestBid: number | null;
  myHighestBid: number;
  bidWindowLabel: string;
  bidWindowState: "open" | "closing" | "closed" | "unset";
}

interface OfficialAssignmentRow {
  game: Game;
  crewLabel: string;
  positionLabel: string;
  awardedFee: number;
}

function isNonOfficialRole(role: string | undefined): role is "assignor" | "school" {
  return role === "assignor" || role === "school";
}

export function Dashboard() {
  const navigate = useNavigate();
  const { user, profile, loading, profileLoading } = useAuth();
  const [games, setGames] = useState<Game[]>([]);
  const [bids, setBids] = useState<Bid[]>([]);
  const [crews, setCrews] = useState<Crew[]>([]);
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
      setCrews([]);
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

  const gamesById = useMemo(() => {
    const result = new Map<string, Game>();
    games.forEach((game) => result.set(game.id, game));
    return result;
  }, [games]);

  const bidsById = useMemo(() => {
    const result = new Map<string, Bid>();
    bids.forEach((bid) => result.set(bid.id, bid));
    return result;
  }, [bids]);

  const bidsByGameId = useMemo(() => {
    const result = new Map<string, Bid[]>();
    bids.forEach((bid) => {
      const current = result.get(bid.gameId) ?? [];
      current.push(bid);
      result.set(bid.gameId, current);
    });
    return result;
  }, [bids]);

  const crewsById = useMemo(() => {
    const result = new Map<string, Crew>();
    crews.forEach((crew) => result.set(crew.id, crew));
    return result;
  }, [crews]);

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

  const needsActionRows = useMemo<OperationsDashboardRow[]>(() => {
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

  const upcomingRows = useMemo<OperationsDashboardRow[]>(() => {
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

  const officialOpenBidRows = useMemo<OfficialOpenBidRow[]>(() => {
    if (!user || profile?.role !== "official") {
      return [];
    }

    const myBidsByGameId = new Map<string, Bid[]>();
    bids
      .filter((bid) => bid.officialUid === user.uid)
      .forEach((bid) => {
        const current = myBidsByGameId.get(bid.gameId) ?? [];
        current.push(bid);
        myBidsByGameId.set(bid.gameId, current);
      });

    const rows: OfficialOpenBidRow[] = [];
    myBidsByGameId.forEach((myGameBids, gameId) => {
      const game = gamesById.get(gameId);
      if (!game || game.status !== "open" || game.mode === "direct_assignment") {
        return;
      }

      const allGameBids = bidsByGameId.get(gameId) ?? [];
      const myHighestBid = myGameBids.reduce(
        (highest, bid) => (bid.amount > highest ? bid.amount : highest),
        myGameBids[0].amount
      );
      const highestBid =
        allGameBids.length > 0
          ? allGameBids.reduce(
              (highest, bid) => (bid.amount > highest ? bid.amount : highest),
              allGameBids[0].amount
            )
          : null;
      const bidWindowInfo = getBidWindowInfo(game.acceptingBidsUntilISO, game.status, nowMs);

      rows.push({
        game,
        bidCount: allGameBids.length,
        highestBid,
        myHighestBid,
        bidWindowLabel: bidWindowInfo.label,
        bidWindowState: bidWindowInfo.state
      });
    });

    return rows.sort((a, b) => {
      const aTime = a.game.acceptingBidsUntilISO
        ? new Date(a.game.acceptingBidsUntilISO).getTime()
        : new Date(a.game.dateISO).getTime();
      const bTime = b.game.acceptingBidsUntilISO
        ? new Date(b.game.acceptingBidsUntilISO).getTime()
        : new Date(b.game.dateISO).getTime();
      return aTime - bTime;
    });
  }, [bids, bidsByGameId, gamesById, nowMs, profile?.role, user]);

  const officialAssignments = useMemo<OfficialAssignmentRow[]>(() => {
    if (!user || profile?.role !== "official") {
      return [];
    }

    return games
      .map((game) => ({
        game,
        selectedBid: game.selectedBidId ? bidsById.get(game.selectedBidId) ?? null : null
      }))
      .filter((entry) => {
        if (entry.game.mode === "direct_assignment") {
          return (
            entry.game.status === "awarded" &&
            isOfficialAssignedToDirectGame(entry.game, user.uid)
          );
        }

        return (
          entry.game.status === "awarded" &&
          isOfficialAssignedToAwardedMarketplaceGame(
            entry.selectedBid,
            crewsById,
            user.uid
          )
        );
      })
      .map(({ game, selectedBid }) => {
        const assignmentDetails = getOfficialAssignmentDetails(
          game,
          selectedBid,
          crewsById,
          user.uid
        );

        return {
          game,
          crewLabel: assignmentDetails.crewLabel,
          positionLabel: assignmentDetails.positionLabel,
          awardedFee:
            game.mode === "direct_assignment"
              ? game.payPosted
              : selectedBid
                ? selectedBid.amount
                : game.payPosted
        };
      })
      .sort((a, b) => new Date(a.game.dateISO).getTime() - new Date(b.game.dateISO).getTime());
  }, [bidsById, crewsById, games, profile?.role, user]);

  const officialUpcomingAssignments = useMemo(() => {
    return officialAssignments
      .filter((entry) => new Date(entry.game.dateISO).getTime() >= nowMs)
      .slice(0, 10);
  }, [officialAssignments, nowMs]);

  const officialHighestOpenOffer = useMemo(() => {
    if (officialOpenBidRows.length === 0) {
      return null;
    }
    return officialOpenBidRows.reduce(
      (highest, row) => (row.myHighestBid > highest ? row.myHighestBid : highest),
      officialOpenBidRows[0].myHighestBid
    );
  }, [officialOpenBidRows]);

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

  if (profile.role === "evaluator") {
    return <Navigate to="/schedule" replace />;
  }

  if (!isNonOfficialRole(profile.role)) {
    return (
      <main className="page">
        <PageHeader
          eyebrow="Official workspace"
          title="Official Dashboard"
          description="Track active bids, awarded work, and upcoming assignments at a glance."
          actions={
            <>
              <ButtonLink to="/marketplace" variant="primary">
                Browse Games
              </ButtonLink>
              <ButtonLink to="/schedule">View Full Schedule</ButtonLink>
              <ButtonLink to="/profile">View Profile</ButtonLink>
            </>
          }
        />

        <section className="dashboard-kpis">
          <article className="dashboard-kpi-card">
            <span className="dashboard-kpi-label">Active Bid Games</span>
            <strong className="dashboard-kpi-value">{officialOpenBidRows.length}</strong>
          </article>
          <article className="dashboard-kpi-card">
            <span className="dashboard-kpi-label">Upcoming Assignments</span>
            <strong className="dashboard-kpi-value">{officialUpcomingAssignments.length}</strong>
          </article>
          <article className="dashboard-kpi-card">
            <span className="dashboard-kpi-label">Total Assigned Games</span>
            <strong className="dashboard-kpi-value">{officialAssignments.length}</strong>
          </article>
          <article className="dashboard-kpi-card">
            <span className="dashboard-kpi-label">Highest Active Offer</span>
            <strong className="dashboard-kpi-value">
              {officialHighestOpenOffer === null
                ? "-"
                : formatCurrency(officialHighestOpenOffer)}
            </strong>
          </article>
        </section>

        {dataError ? <p className="error-text">{dataError}</p> : null}

        <section className="dashboard-panel">
          <SectionHeader
            title="Open Bid Activity"
            meta={`${officialOpenBidRows.length} game(s)`}
            className="results-header"
          />

          {officialOpenBidRows.length === 0 ? (
            <p className="empty-state">No active bid games right now.</p>
          ) : (
            <div className="schedule-table-wrapper">
              <table className="schedule-table schedule-table-mobile-cards">
                <thead>
                  <tr>
                    <th>Date/Time</th>
                    <th>School</th>
                    <th>Sport/Level</th>
                    <th>Bid Window</th>
                    <th>Your Bid</th>
                    <th>Current Price</th>
                    <th>Total Bids</th>
                  </tr>
                </thead>
                <tbody>
                  {officialOpenBidRows.map((row) => (
                    <tr
                      key={row.game.id}
                      className="clickable-row"
                      role="button"
                      tabIndex={0}
                      onClick={() => navigate(`/schedule/games/${row.game.id}`)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" || event.key === " ") {
                          event.preventDefault();
                          navigate(`/schedule/games/${row.game.id}`);
                        }
                      }}
                      aria-label={`Open details for ${row.game.schoolName} on ${formatGameDate(row.game.dateISO)}`}
                    >
                      <td data-label="Date/Time">{formatGameDate(row.game.dateISO)}</td>
                      <td data-label="School">{row.game.schoolName}</td>
                      <td data-label="Sport/Level">
                        {row.game.sport} • {row.game.level}
                      </td>
                      <td data-label="Bid Window">
                        <span className={`bid-window-label bid-window-${row.bidWindowState}`}>
                          {row.bidWindowLabel}
                        </span>
                      </td>
                      <td data-label="Your Bid">{formatCurrency(row.myHighestBid)}</td>
                      <td data-label="Current Price">
                        {row.highestBid === null ? "-" : formatCurrency(row.highestBid)}
                      </td>
                      <td data-label="Total Bids">{row.bidCount}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section className="dashboard-panel">
          <SectionHeader
            title="Upcoming Assignments"
            meta={`${officialUpcomingAssignments.length} game(s)`}
            className="results-header"
          />

          {officialUpcomingAssignments.length === 0 ? (
            <p className="empty-state">No upcoming assigned games yet.</p>
          ) : (
            <div className="schedule-table-wrapper">
              <table className="schedule-table schedule-table-mobile-cards">
                <thead>
                  <tr>
                    <th>Date/Time</th>
                    <th>School</th>
                    <th>Sport/Level</th>
                    <th>Location</th>
                    <th>Position</th>
                    <th>Crew</th>
                    <th>Awarded Fee</th>
                  </tr>
                </thead>
                <tbody>
                  {officialUpcomingAssignments.map((entry) => (
                    <tr
                      key={entry.game.id}
                      className="clickable-row"
                      role="button"
                      tabIndex={0}
                      onClick={() => navigate(`/schedule/games/${entry.game.id}`)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" || event.key === " ") {
                          event.preventDefault();
                          navigate(`/schedule/games/${entry.game.id}`);
                        }
                      }}
                      aria-label={`Open details for ${entry.game.schoolName} on ${formatGameDate(entry.game.dateISO)}`}
                    >
                      <td data-label="Date/Time">{formatGameDate(entry.game.dateISO)}</td>
                      <td data-label="School">{entry.game.schoolName}</td>
                      <td data-label="Sport/Level">
                        {entry.game.sport} • {entry.game.level}
                      </td>
                      <td data-label="Location">{entry.game.location}</td>
                      <td data-label="Position">{entry.positionLabel}</td>
                      <td data-label="Crew">{entry.crewLabel}</td>
                      <td data-label="Awarded Fee">{formatCurrency(entry.awardedFee)}</td>
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

  return (
    <main className="page">
      <PageHeader
        eyebrow="Operations center"
        title="Operations Dashboard"
        description="Monitor posted games, open bidding windows, and upcoming staffing decisions."
        actions={
          <>
            <ButtonLink to="/post-game" variant="primary">
              Post a Game
            </ButtonLink>
            <ButtonLink to="/assign-game" variant="primary">
              Assign Game
            </ButtonLink>
            <ButtonLink to="/schedule">View Full Schedule</ButtonLink>
          </>
        }
      />

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
        <SectionHeader
          title="Needs Action"
          meta={`${needsActionRows.length} game(s)`}
          className="results-header"
        />

        {needsActionRows.length === 0 ? (
          <p className="empty-state">No open games need attention right now.</p>
        ) : (
          <div className="schedule-table-wrapper">
            <table className="schedule-table schedule-table-mobile-cards">
              <thead>
                <tr>
                  <th>Date/Time</th>
                  <th>School</th>
                  <th>Sport/Level</th>
                  <th>Bid Window</th>
                  <th>Total Bids</th>
                  <th>Highest Bid</th>
                </tr>
              </thead>
              <tbody>
                {needsActionRows.map((row) => (
                  <tr
                    key={row.game.id}
                    className="clickable-row"
                    role="button"
                    tabIndex={0}
                    onClick={() => navigate(`/schedule/games/${row.game.id}`)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        navigate(`/schedule/games/${row.game.id}`);
                      }
                    }}
                    aria-label={`Open details for ${row.game.schoolName} on ${formatGameDate(row.game.dateISO)}`}
                  >
                    <td data-label="Date/Time">{formatGameDate(row.game.dateISO)}</td>
                    <td data-label="School">{row.game.schoolName}</td>
                    <td data-label="Sport/Level">
                      {row.game.sport} • {row.game.level}
                    </td>
                    <td data-label="Bid Window">
                      <span className={`bid-window-label bid-window-${row.bidWindowState}`}>
                        {row.bidWindowLabel}
                      </span>
                    </td>
                    <td data-label="Total Bids">{row.bidCount}</td>
                    <td data-label="Highest Bid">
                      {row.highestBid === null ? "-" : formatCurrency(row.highestBid)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="dashboard-panel">
        <SectionHeader
          title="Upcoming Games"
          meta={`${upcomingRows.length} game(s)`}
          className="results-header"
        />

        {upcomingRows.length === 0 ? (
          <p className="empty-state">No upcoming games posted yet.</p>
        ) : (
          <div className="schedule-table-wrapper">
            <table className="schedule-table schedule-table-mobile-cards">
              <thead>
                <tr>
                  <th>Date/Time</th>
                  <th>School</th>
                  <th>Sport/Level</th>
                  <th>Status</th>
                  <th>Total Bids</th>
                  <th>Highest Bid</th>
                </tr>
              </thead>
              <tbody>
                {upcomingRows.map((row) => (
                  <tr
                    key={row.game.id}
                    className="clickable-row"
                    role="button"
                    tabIndex={0}
                    onClick={() => navigate(`/schedule/games/${row.game.id}`)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        navigate(`/schedule/games/${row.game.id}`);
                      }
                    }}
                    aria-label={`Open details for ${row.game.schoolName} on ${formatGameDate(row.game.dateISO)}`}
                  >
                    <td data-label="Date/Time">{formatGameDate(row.game.dateISO)}</td>
                    <td data-label="School">{row.game.schoolName}</td>
                    <td data-label="Sport/Level">
                      {row.game.sport} • {row.game.level}
                    </td>
                    <td data-label="Status">
                      {getGameStatusLabel(row.game.status, row.game.mode)}
                    </td>
                    <td data-label="Total Bids">{row.bidCount}</td>
                    <td data-label="Highest Bid">
                      {row.highestBid === null ? "-" : formatCurrency(row.highestBid)}
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

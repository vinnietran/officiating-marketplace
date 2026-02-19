import { useEffect, useMemo, useState } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { CompleteProfilePanel } from "../components/CompleteProfilePanel";
import { useAuth } from "../context/AuthContext";
import { FIRESTORE_DATABASE_ID } from "../lib/firebase";
import { getReadableFirestoreError } from "../lib/firebaseErrors";
import {
  formatCurrency,
  formatGameDate,
  getBidWindowInfo,
  getGameStatusLabel
} from "../lib/format";
import { subscribeBids, subscribeCrews, subscribeGames } from "../lib/firestore";
import type { Bid, Crew, FootballPosition, Game } from "../types";

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

const FOOTBALL_POSITION_LABELS: Record<FootballPosition, string> = {
  R: "Referee",
  U: "Umpire",
  C: "Center Judge",
  H: "Head Line Judge",
  L: "Line Judge",
  S: "Side Judge",
  F: "Field Judge",
  B: "Back Judge",
  RO: "Replay Official",
  RC: "Replay Communicator",
  ALT: "Alternate"
};

function isNonOfficialRole(role: string | undefined): role is "assignor" | "school" {
  return role === "assignor" || role === "school";
}

function isOfficialAssignedToDirectGame(game: Game, officialUid: string): boolean {
  if (game.mode !== "direct_assignment") {
    return false;
  }

  return (game.directAssignments ?? []).some((assignment) => {
    if (assignment.assignmentType === "individual") {
      return assignment.officialUid === officialUid;
    }
    return assignment.memberUids.includes(officialUid);
  });
}

function isOfficialAssignedToAwardedMarketplaceGame(
  selectedBid: Bid | null,
  crewsById: Map<string, Crew>,
  officialUid: string
): boolean {
  if (!selectedBid) {
    return false;
  }

  if (selectedBid.officialUid === officialUid) {
    return true;
  }

  if (selectedBid.bidderType !== "crew" || !selectedBid.crewId) {
    return false;
  }

  const awardedCrew = crewsById.get(selectedBid.crewId);
  if (!awardedCrew) {
    return false;
  }

  return awardedCrew.memberUids.includes(officialUid);
}

function toPositionLabel(position?: FootballPosition): string {
  if (!position) {
    return "Unassigned";
  }
  return `${FOOTBALL_POSITION_LABELS[position]} (${position})`;
}

function getOfficialAssignmentDetails(
  game: Game,
  selectedBid: Bid | null,
  crewsById: Map<string, Crew>,
  officialUid: string
): { crewLabel: string; positionLabel: string } {
  if (game.mode === "direct_assignment") {
    const assignment = (game.directAssignments ?? []).find((candidate) => {
      if (candidate.assignmentType === "individual") {
        return candidate.officialUid === officialUid;
      }
      return candidate.memberUids.includes(officialUid);
    });

    if (!assignment) {
      return { crewLabel: "Assigned", positionLabel: "Unassigned" };
    }
    if (assignment.assignmentType === "crew") {
      const assignedCrew = crewsById.get(assignment.crewId);
      return {
        crewLabel: assignment.crewName,
        positionLabel: toPositionLabel(assignedCrew?.memberPositions?.[officialUid])
      };
    }
    return {
      crewLabel: "Individual",
      positionLabel: toPositionLabel(assignment.position)
    };
  }

  if (!selectedBid) {
    return { crewLabel: "Assigned", positionLabel: "Unassigned" };
  }
  if (selectedBid.bidderType === "crew") {
    const awardedCrew = selectedBid.crewId ? crewsById.get(selectedBid.crewId) : null;
    return {
      crewLabel: selectedBid.crewName ?? "Crew",
      positionLabel: toPositionLabel(awardedCrew?.memberPositions?.[officialUid])
    };
  }
  return { crewLabel: "Individual", positionLabel: "Unassigned" };
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
        <header className="hero">
          <h1>Official Dashboard</h1>
          <p>Track your active bids and upcoming assigned games.</p>
        </header>

        <section className="dashboard-actions">
          <Link to="/marketplace" className="nav-link active">
            Browse Games
          </Link>
          <Link to="/schedule" className="button-secondary dashboard-link-button">
            View Full Schedule
          </Link>
          <Link to="/profile" className="button-secondary dashboard-link-button">
            View Profile
          </Link>
        </section>

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
          <div className="results-header">
            <h2>Open Bid Activity</h2>
            <span>{officialOpenBidRows.length} game(s)</span>
          </div>

          {officialOpenBidRows.length === 0 ? (
            <p className="empty-state">No active bid games right now.</p>
          ) : (
            <div className="schedule-table-wrapper">
              <table className="schedule-table">
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
                      <td>{formatCurrency(row.myHighestBid)}</td>
                      <td>{row.highestBid === null ? "-" : formatCurrency(row.highestBid)}</td>
                      <td>{row.bidCount}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section className="dashboard-panel">
          <div className="results-header">
            <h2>Upcoming Assignments</h2>
            <span>{officialUpcomingAssignments.length} game(s)</span>
          </div>

          {officialUpcomingAssignments.length === 0 ? (
            <p className="empty-state">No upcoming assigned games yet.</p>
          ) : (
            <div className="schedule-table-wrapper">
              <table className="schedule-table">
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
                      <td>{formatGameDate(entry.game.dateISO)}</td>
                      <td>{entry.game.schoolName}</td>
                      <td>
                        {entry.game.sport} • {entry.game.level}
                      </td>
                      <td>{entry.game.location}</td>
                      <td>{entry.positionLabel}</td>
                      <td>{entry.crewLabel}</td>
                      <td>{formatCurrency(entry.awardedFee)}</td>
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
                    <td>{formatGameDate(row.game.dateISO)}</td>
                    <td>{row.game.schoolName}</td>
                    <td>
                      {row.game.sport} • {row.game.level}
                    </td>
                    <td>{getGameStatusLabel(row.game.status, row.game.mode)}</td>
                    <td>{row.bidCount}</td>
                    <td>{row.highestBid === null ? "-" : formatCurrency(row.highestBid)}</td>
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

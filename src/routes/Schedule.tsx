import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AuthPanel } from "../components/AuthPanel";
import { CompleteProfilePanel } from "../components/CompleteProfilePanel";
import { useAuth } from "../context/AuthContext";
import {
  getBidderName,
  getDirectAssignmentLabel,
  isOfficialAssignedToAwardedMarketplaceGame,
  isOfficialAssignedToDirectGame
} from "../lib/gameAssignments";
import {
  formatCurrency,
  formatGameDate,
  getBidWindowInfo,
  getGameStatusLabel
} from "../lib/format";
import { subscribeBids, subscribeCrews, subscribeGames } from "../lib/firestore";
import { FIRESTORE_DATABASE_ID } from "../lib/firebase";
import { getReadableFirestoreError } from "../lib/firebaseErrors";
import type { Bid, Crew, Game } from "../types";

export function Schedule() {
  const navigate = useNavigate();
  const { user, profile, loading, profileLoading } = useAuth();

  const [games, setGames] = useState<Game[]>([]);
  const [bids, setBids] = useState<Bid[]>([]);
  const [crews, setCrews] = useState<Crew[]>([]);
  const [dataError, setDataError] = useState<string | null>(null);
  const [nowMs, setNowMs] = useState(() => Date.now());

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

  const officialScheduleGames = useMemo(() => {
    if (!user || profile?.role !== "official") {
      return [];
    }

    return games
      .map((game) => ({
        game,
        selectedBid: game.selectedBidId ? bidsById.get(game.selectedBidId) ?? null : null
      }))
      .filter(
        (entry) => {
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
        }
      )
      .sort(
        (a, b) =>
          new Date(a.game.dateISO).getTime() - new Date(b.game.dateISO).getTime()
      );
  }, [games, bidsById, crewsById, profile?.role, user]);

  const assignorOrSchoolScheduleGames = useMemo(() => {
    if (!user || (profile?.role !== "assignor" && profile?.role !== "school")) {
      return [];
    }

    return games
      .filter((game) => game.createdByUid === user.uid)
      .map((game) => ({
        game,
        selectedBid: game.selectedBidId ? bidsById.get(game.selectedBidId) ?? null : null
      }))
      .sort(
        (a, b) =>
          new Date(a.game.dateISO).getTime() - new Date(b.game.dateISO).getTime()
      );
  }, [games, bidsById, profile?.role, user]);

  const evaluatorScheduleGames = useMemo(() => {
    if (profile?.role !== "evaluator") {
      return [];
    }

    return games
      .map((game) => ({
        game,
        selectedBid: game.selectedBidId ? bidsById.get(game.selectedBidId) ?? null : null
      }))
      .sort(
        (a, b) =>
          new Date(a.game.dateISO).getTime() - new Date(b.game.dateISO).getTime()
      );
  }, [games, bidsById, profile?.role]);

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
          <h1>Schedule</h1>
          <p>Sign in to view your assignments and posted games.</p>
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
          <h1>Schedule</h1>
        </header>
        <CompleteProfilePanel />
      </main>
    );
  }

  return (
    <main className="page">
      <header className="hero">
        <h1>Schedule</h1>
        <p>
          {profile.role === "official"
            ? "Your assigned games"
            : profile.role === "evaluator"
              ? "All games across the marketplace."
            : "Games you posted and current award status."}
        </p>
      </header>

      {dataError ? <p className="error-text">{dataError}</p> : null}

      {profile.role === "official" ? (
        <section className="schedule-table-wrapper schedule-table-wrapper-no-scroll">
          {officialScheduleGames.length === 0 ? (
            <div className="empty-state">No awarded games yet.</div>
          ) : (
            <table className="schedule-table schedule-table-wrap">
              <thead>
                <tr>
                  <th>Date/Time</th>
                  <th>Bid Window</th>
                  <th>School</th>
                  <th>Sport/Level</th>
                  <th>Location</th>
                  <th>Assigned By</th>
                  <th>Game Fee</th>
                </tr>
              </thead>
              <tbody>
                {officialScheduleGames.map(({ game, selectedBid }) => {
                  const assignedByLabel = game.createdByName
                    ? `${game.createdByName} (${game.createdByRole})`
                    : game.createdByRole;
                  const bidWindowInfo = getBidWindowInfo(
                    game.acceptingBidsUntilISO,
                    game.status,
                    nowMs
                  );

                  return (
                    <tr
                      key={game.id}
                      className="clickable-row"
                      role="button"
                      tabIndex={0}
                      onClick={() =>
                        navigate(`/schedule/games/${game.id}`, {
                          state: { from: "schedule" }
                        })
                      }
                      onKeyDown={(event) => {
                        if (event.key === "Enter" || event.key === " ") {
                          event.preventDefault();
                          navigate(`/schedule/games/${game.id}`, {
                            state: { from: "schedule" }
                          });
                        }
                      }}
                      aria-label={`Open details for ${game.schoolName} on ${formatGameDate(game.dateISO)}`}
                    >
                      <td>{formatGameDate(game.dateISO)}</td>
                      <td>
                        {game.mode === "direct_assignment" ? (
                          "-"
                        ) : (
                          <span className={`bid-window-label bid-window-${bidWindowInfo.state}`}>
                            {bidWindowInfo.label}
                          </span>
                        )}
                      </td>
                      <td>{game.schoolName}</td>
                      <td>
                        {game.sport} • {game.level}
                      </td>
                      <td>{game.location}</td>
                      <td>{assignedByLabel}</td>
                      <td>
                        {selectedBid
                          ? formatCurrency(selectedBid.amount)
                          : formatCurrency(game.payPosted)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </section>
      ) : profile.role === "evaluator" ? (
        <section className="schedule-table-wrapper schedule-table-wrapper-no-scroll">
          {evaluatorScheduleGames.length === 0 ? (
            <div className="empty-state">No games found.</div>
          ) : (
            <table className="schedule-table schedule-table-wrap">
              <thead>
                <tr>
                  <th>Date/Time</th>
                  <th>Bid Window</th>
                  <th>School</th>
                  <th>Sport/Level</th>
                  <th>Location</th>
                  <th>Status</th>
                  <th>Current Price</th>
                </tr>
              </thead>
              <tbody>
                {evaluatorScheduleGames.map(({ game, selectedBid }) => {
                  const bidWindowInfo = getBidWindowInfo(
                    game.acceptingBidsUntilISO,
                    game.status,
                    nowMs
                  );

                  const currentPrice =
                    game.status === "awarded" && selectedBid
                      ? selectedBid.amount
                      : game.payPosted;

                  return (
                    <tr
                      key={game.id}
                      className="clickable-row"
                      role="button"
                      tabIndex={0}
                      onClick={() => navigate(`/schedule/games/${game.id}`)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" || event.key === " ") {
                          event.preventDefault();
                          navigate(`/schedule/games/${game.id}`);
                        }
                      }}
                      aria-label={`Open details for ${game.schoolName} on ${formatGameDate(game.dateISO)}`}
                    >
                      <td>{formatGameDate(game.dateISO)}</td>
                      <td>
                        {game.mode === "direct_assignment" ? (
                          "-"
                        ) : (
                          <span className={`bid-window-label bid-window-${bidWindowInfo.state}`}>
                            {bidWindowInfo.label}
                          </span>
                        )}
                      </td>
                      <td>{game.schoolName}</td>
                      <td>
                        {game.sport} • {game.level}
                      </td>
                      <td>{game.location}</td>
                      <td>{getGameStatusLabel(game.status, game.mode)}</td>
                      <td>{formatCurrency(currentPrice)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </section>
      ) : (
        <section className="schedule-table-wrapper schedule-table-wrapper-no-scroll">
          {assignorOrSchoolScheduleGames.length === 0 ? (
            <div className="empty-state">No posted games yet.</div>
          ) : (
            <table className="schedule-table schedule-table-wrap">
              <thead>
                <tr>
                  <th>Date/Time</th>
                  <th>Bid Window</th>
                  <th>School</th>
                  <th>Sport/Level</th>
                  <th>Location</th>
                  <th>Status</th>
                  <th>Awarded To</th>
                  <th>Awarded Price</th>
                  <th>Bid Submitted</th>
                </tr>
              </thead>
              <tbody>
                {assignorOrSchoolScheduleGames.map(({ game, selectedBid }) => {
                  const bidWindowInfo = getBidWindowInfo(
                    game.acceptingBidsUntilISO,
                    game.status,
                    nowMs
                  );

                  return (
                    <tr
                      key={game.id}
                      className="clickable-row"
                      role="button"
                      tabIndex={0}
                      onClick={() => navigate(`/schedule/games/${game.id}`)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" || event.key === " ") {
                          event.preventDefault();
                          navigate(`/schedule/games/${game.id}`);
                        }
                      }}
                      aria-label={`Open details for ${game.schoolName} on ${formatGameDate(game.dateISO)}`}
                    >
                      <td>{formatGameDate(game.dateISO)}</td>
                      <td>
                        {game.mode === "direct_assignment" ? (
                          "-"
                        ) : (
                          <span className={`bid-window-label bid-window-${bidWindowInfo.state}`}>
                            {bidWindowInfo.label}
                          </span>
                        )}
                      </td>
                      <td>{game.schoolName}</td>
                      <td>
                        {game.sport} • {game.level}
                      </td>
                      <td>{game.location}</td>
                      <td>{getGameStatusLabel(game.status, game.mode)}</td>
                      <td>
                        {game.mode === "direct_assignment"
                          ? getDirectAssignmentLabel(game)
                          : getBidderName(selectedBid)}
                      </td>
                      <td>
                        {game.mode === "direct_assignment"
                          ? formatCurrency(game.payPosted)
                          : selectedBid
                            ? formatCurrency(selectedBid.amount)
                            : "-"}
                      </td>
                      <td>
                        {game.mode === "direct_assignment"
                          ? formatGameDate(game.createdAtISO)
                          : selectedBid
                            ? formatGameDate(selectedBid.createdAtISO)
                            : "-"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </section>
      )}
    </main>
  );
}

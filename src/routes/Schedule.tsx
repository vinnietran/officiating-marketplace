import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AuthPanel } from "../components/AuthPanel";
import { CompleteProfilePanel } from "../components/CompleteProfilePanel";
import { useAuth } from "../context/AuthContext";
import { formatCurrency, formatGameDate, getBidWindowInfo } from "../lib/format";
import { subscribeBids, subscribeGames } from "../lib/firestore";
import { FIRESTORE_DATABASE_ID } from "../lib/firebase";
import { getReadableFirestoreError } from "../lib/firebaseErrors";
import type { Bid, Game } from "../types";

function getBidderName(bid: Bid | null): string {
  if (!bid) {
    return "-";
  }
  if (bid.bidderType === "crew" && bid.crewName) {
    return `${bid.crewName} (Crew)`;
  }
  return bid.officialName;
}

export function Schedule() {
  const navigate = useNavigate();
  const { user, profile, loading, profileLoading } = useAuth();

  const [games, setGames] = useState<Game[]>([]);
  const [bids, setBids] = useState<Bid[]>([]);
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
        (entry) =>
          entry.game.status === "awarded" &&
          entry.selectedBid?.officialUid === user.uid
      )
      .sort(
        (a, b) =>
          new Date(a.game.dateISO).getTime() - new Date(b.game.dateISO).getTime()
      );
  }, [games, bidsById, profile?.role, user]);

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
            : "Games you posted and current award status."}
        </p>
      </header>

      {dataError ? <p className="error-text">{dataError}</p> : null}

      {profile.role === "official" ? (
        <section className="schedule-table-wrapper">
          {officialScheduleGames.length === 0 ? (
            <div className="empty-state">No awarded games yet.</div>
          ) : (
            <table className="schedule-table">
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
                    <tr key={game.id}>
                      <td>{formatGameDate(game.dateISO)}</td>
                      <td>
                        <span className={`bid-window-label bid-window-${bidWindowInfo.state}`}>
                          {bidWindowInfo.label}
                        </span>
                      </td>
                      <td>{game.schoolName}</td>
                      <td>
                        {game.sport} • {game.level}
                      </td>
                      <td>{game.location}</td>
                      <td>{assignedByLabel}</td>
                      <td>{selectedBid ? formatCurrency(selectedBid.amount) : "-"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </section>
      ) : (
        <section className="schedule-table-wrapper">
          {assignorOrSchoolScheduleGames.length === 0 ? (
            <div className="empty-state">No posted games yet.</div>
          ) : (
            <table className="schedule-table">
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
                        <span className={`bid-window-label bid-window-${bidWindowInfo.state}`}>
                          {bidWindowInfo.label}
                        </span>
                      </td>
                      <td>{game.schoolName}</td>
                      <td>
                        {game.sport} • {game.level}
                      </td>
                      <td>{game.location}</td>
                      <td>{game.status === "awarded" ? "Awarded" : "Open"}</td>
                      <td>{getBidderName(selectedBid)}</td>
                      <td>{selectedBid ? formatCurrency(selectedBid.amount) : "-"}</td>
                      <td>{selectedBid ? formatGameDate(selectedBid.createdAtISO) : "-"}</td>
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

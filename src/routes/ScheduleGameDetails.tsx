import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { AuthPanel } from "../components/AuthPanel";
import { CompleteProfilePanel } from "../components/CompleteProfilePanel";
import { MessageModal } from "../components/MessageModal";
import { useAuth } from "../context/AuthContext";
import { formatCurrency, formatGameDate, getBidWindowInfo } from "../lib/format";
import { selectBid, subscribeBids, subscribeGames } from "../lib/firestore";
import { FIRESTORE_DATABASE_ID } from "../lib/firebase";
import { getReadableFirestoreError } from "../lib/firebaseErrors";
import type { Bid, Game } from "../types";

function getBidderLabel(bid: Bid): string {
  if (bid.bidderType === "crew" && bid.crewName) {
    return `${bid.crewName} (Crew)`;
  }
  return `${bid.officialName} (Individual)`;
}

export function ScheduleGameDetails() {
  const { gameId } = useParams<{ gameId: string }>();
  const { user, profile, loading, profileLoading } = useAuth();

  const [games, setGames] = useState<Game[]>([]);
  const [bids, setBids] = useState<Bid[]>([]);
  const [dataError, setDataError] = useState<string | null>(null);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [busyBidId, setBusyBidId] = useState<string | null>(null);
  const [modalMessage, setModalMessage] = useState<{
    title: string;
    message: string;
  } | null>(null);

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

  const game = useMemo(
    () => games.find((candidate) => candidate.id === gameId) ?? null,
    [games, gameId]
  );

  const gameBids = useMemo(
    () =>
      bids
        .filter((bid) => bid.gameId === gameId)
        .sort(
          (a, b) =>
            b.amount - a.amount || b.createdAtISO.localeCompare(a.createdAtISO)
        ),
    [bids, gameId]
  );

  const highestBid = gameBids.length > 0 ? gameBids[0] : null;

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
          <h1>Game Details</h1>
          <p>Sign in to view schedule details.</p>
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
          <h1>Game Details</h1>
        </header>
        <CompleteProfilePanel />
      </main>
    );
  }

  if (profile.role === "official") {
    return (
      <main className="page">
        <header className="hero">
          <h1>Game Details</h1>
          <p>This view is only available to assignors and schools.</p>
        </header>
        <Link to="/schedule" className="button-secondary details-back-link">
          Back to Schedule
        </Link>
      </main>
    );
  }

  if (!game) {
    return (
      <main className="page">
        <header className="hero">
          <h1>Game Details</h1>
          <p>Game not found.</p>
        </header>
        <Link to="/schedule" className="button-secondary details-back-link">
          Back to Schedule
        </Link>
      </main>
    );
  }

  if (game.createdByUid !== user.uid) {
    return (
      <main className="page">
        <header className="hero">
          <h1>Game Details</h1>
          <p>You can only view details for games you posted.</p>
        </header>
        <Link to="/schedule" className="button-secondary details-back-link">
          Back to Schedule
        </Link>
      </main>
    );
  }

  const activeGame = game;

  const selectedBid = activeGame.selectedBidId
    ? gameBids.find((bid) => bid.id === activeGame.selectedBidId) ?? null
    : null;
  const bidWindowInfo = getBidWindowInfo(
    activeGame.acceptingBidsUntilISO,
    activeGame.status,
    nowMs
  );

  async function handleSelectBid(bidId: string) {
    if (activeGame.status !== "open") {
      setModalMessage({
        title: "Selection Closed",
        message: "This game is already awarded."
      });
      return;
    }

    setBusyBidId(bidId);
    try {
      await selectBid(activeGame.id, bidId);
      setModalMessage({
        title: "Bid Selected",
        message: "The bid was selected successfully."
      });
    } catch (error) {
      setDataError(getReadableFirestoreError(error, FIRESTORE_DATABASE_ID));
    } finally {
      setBusyBidId(null);
    }
  }

  return (
    <main className="page">
      <header className="hero">
        <h1>Game Details</h1>
        <p>
          {activeGame.schoolName} • {activeGame.sport} • {activeGame.level}
        </p>
      </header>

      <Link to="/schedule" className="button-secondary details-back-link">
        Back to Schedule
      </Link>

      {dataError ? <p className="error-text">{dataError}</p> : null}

      <section className="details-grid">
        <article className="details-card">
          <h3>Game Info</h3>
          <p className="meta-line">Date/Time: {formatGameDate(activeGame.dateISO)}</p>
          <p className="meta-line">Location: {activeGame.location}</p>
          <p className="meta-line">Posted pay: {formatCurrency(activeGame.payPosted)}</p>
          <p className="meta-line">
            Status: {activeGame.status === "awarded" ? "Awarded" : "Open"}
          </p>
          <p className="meta-line">
            Assigned by: {activeGame.createdByName ?? activeGame.createdByRole}
          </p>
          <p className={`meta-line bid-window bid-window-${bidWindowInfo.state}`}>
            Bid window: <strong>{bidWindowInfo.label}</strong>
          </p>
          {activeGame.notes ? <p className="meta-line">Notes: {activeGame.notes}</p> : null}
        </article>

        <article className="details-card">
          <h3>Bidding Snapshot</h3>
          <p className="meta-line">Total bids: {gameBids.length}</p>
          <p className="meta-line">
            Highest bid: {highestBid ? formatCurrency(highestBid.amount) : "-"}
          </p>
          <p className="meta-line">
            Selected bidder: {selectedBid ? getBidderLabel(selectedBid) : "Not selected"}
          </p>
          <p className="meta-line">
            Selected amount: {selectedBid ? formatCurrency(selectedBid.amount) : "-"}
          </p>
        </article>
      </section>

      <section className="schedule-table-wrapper">
        <table className="schedule-table">
          <thead>
            <tr>
              <th>Bidder</th>
              <th>Submitted By</th>
              <th>Amount</th>
              <th>Submitted</th>
              <th>Message</th>
              <th>Status</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            {gameBids.length === 0 ? (
              <tr>
                <td colSpan={7}>No bids yet.</td>
              </tr>
            ) : (
              gameBids.map((bid) => {
                const isSelected = activeGame.selectedBidId === bid.id;

                return (
                  <tr key={bid.id}>
                    <td>{getBidderLabel(bid)}</td>
                    <td>{bid.officialName}</td>
                    <td>{formatCurrency(bid.amount)}</td>
                    <td>{formatGameDate(bid.createdAtISO)}</td>
                    <td>{bid.message ?? "-"}</td>
                    <td>
                      {isSelected ? <span className="selected-badge-inline">Selected</span> : "-"}
                    </td>
                    <td>
                      {isSelected ? (
                        "-"
                      ) : (
                        <button
                          type="button"
                          className="button-secondary"
                          onClick={() => handleSelectBid(bid.id)}
                          disabled={activeGame.status !== "open" || busyBidId === bid.id}
                        >
                          {busyBidId === bid.id ? "Selecting..." : "Select Bid"}
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </section>

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

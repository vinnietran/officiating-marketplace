import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { BidForm } from "./BidForm";
import { EditGameForm } from "./EditGameForm";
import { formatCurrency, formatGameDate, getBidWindowInfo } from "../lib/format";
import type { Bid, Crew, Game, UserRole } from "../types";

interface GameCardProps {
  game: Game;
  bids: Bid[];
  role: UserRole;
  currentUserId: string;
  currentUserName: string;
  availableCrews: Crew[];
  canManageGame: boolean;
  onSubmitBid: (
    gameId: string,
    input: {
      officialName: string;
      bidderType: "individual" | "crew";
      crewId?: string;
      crewName?: string;
      amount: number;
      message?: string;
    }
  ) => Promise<void>;
  onDeleteBid: (bidId: string) => Promise<void>;
  onUpdateGame: (
    gameId: string,
    input: {
      schoolName: string;
      sport: Game["sport"];
      level: Game["level"];
      dateISO: string;
      acceptingBidsUntilISO?: string;
      location: string;
      payPosted: number;
      notes?: string;
    }
  ) => Promise<void>;
}

export function GameCard({
  game,
  bids,
  role,
  currentUserId,
  currentUserName,
  availableCrews,
  canManageGame,
  onSubmitBid,
  onDeleteBid,
  onUpdateGame
}: GameCardProps) {
  const navigate = useNavigate();
  const [showBidForm, setShowBidForm] = useState(false);
  const [showEditForm, setShowEditForm] = useState(false);
  const [busyBidId, setBusyBidId] = useState<string | null>(null);
  const [nowMs, setNowMs] = useState(() => Date.now());

  useEffect(() => {
    const timerId = window.setInterval(() => {
      setNowMs(Date.now());
    }, 60000);

    return () => window.clearInterval(timerId);
  }, []);

  const allGameBids = useMemo(
    () =>
      bids
        .filter((bid) => bid.gameId === game.id)
        .sort((a, b) => b.createdAtISO.localeCompare(a.createdAtISO)),
    [bids, game.id]
  );
  const totalBidCount = allGameBids.length;
  const bidWindowInfo = useMemo(
    () => getBidWindowInfo(game.acceptingBidsUntilISO, game.status, nowMs),
    [game.acceptingBidsUntilISO, game.status, nowMs]
  );
  const highestBidAmount =
    allGameBids.length > 0
      ? allGameBids.reduce(
          (highest, bid) => (bid.amount > highest ? bid.amount : highest),
          allGameBids[0].amount
        )
      : null;
  const isDirectAssignment = game.mode === "direct_assignment";
  const directAssignmentCount = game.directAssignments?.length ?? 0;

  const officialBidsForGame = useMemo(
    () => allGameBids.filter((bid) => bid.officialUid === currentUserId),
    [allGameBids, currentUserId]
  );

  const highestUserBid = useMemo(() => {
    if (officialBidsForGame.length === 0) {
      return null;
    }
    return officialBidsForGame.reduce(
      (highest, bid) => (bid.amount > highest ? bid.amount : highest),
      officialBidsForGame[0].amount
    );
  }, [officialBidsForGame]);

  const canPlaceBid = useMemo(() => {
    return role === "official" && game.status === "open" && !isDirectAssignment;
  }, [role, game.status, isDirectAssignment]);

  const placeBidDisabledReason = useMemo(() => {
    if (role !== "official") {
      return null;
    }
    if (isDirectAssignment) {
      return "This game was directly assigned. Bidding is not available.";
    }
    if (game.status !== "open") {
      return "Bidding is closed for this game.";
    }
    return null;
  }, [role, game.status, isDirectAssignment]);

  const gameBids = useMemo(() => {
    if (role === "official") {
      return officialBidsForGame;
    }

    return [];
  }, [officialBidsForGame, role]);

  const canOpenDetailsFromCard = canManageGame && role !== "official";

  function openDetails() {
    navigate(`/schedule/games/${game.id}`);
  }

  function handleCardClick(event: React.MouseEvent<HTMLElement>) {
    if (!canOpenDetailsFromCard) {
      return;
    }

    const target = event.target as HTMLElement;
    if (target.closest("button, input, textarea, select, form, a")) {
      return;
    }

    openDetails();
  }

  function handleCardKeyDown(event: React.KeyboardEvent<HTMLElement>) {
    if (!canOpenDetailsFromCard) {
      return;
    }

    if (event.key !== "Enter" && event.key !== " ") {
      return;
    }

    const target = event.target as HTMLElement;
    if (target.closest("button, input, textarea, select, form, a")) {
      return;
    }

    event.preventDefault();
    openDetails();
  }

  async function handleBidSubmit(values: {
    officialName: string;
    bidderType: "individual" | "crew";
    crewId?: string;
    crewName?: string;
    amount: number;
    message?: string;
  }) {
    await onSubmitBid(game.id, values);
    setShowBidForm(false);
  }

  async function handleDeleteBid(bidId: string) {
    setBusyBidId(bidId);
    try {
      await onDeleteBid(bidId);
    } finally {
      setBusyBidId(null);
    }
  }

  async function handleGameUpdate(input: {
    schoolName: string;
    sport: Game["sport"];
    level: Game["level"];
    dateISO: string;
    acceptingBidsUntilISO?: string;
    location: string;
    payPosted: number;
    notes?: string;
  }) {
    await onUpdateGame(game.id, input);
    setShowEditForm(false);
  }

  return (
    <article
      className={`game-card${canOpenDetailsFromCard ? " clickable-game-card" : ""}`}
      role={canOpenDetailsFromCard ? "button" : undefined}
      tabIndex={canOpenDetailsFromCard ? 0 : undefined}
      onClick={handleCardClick}
      onKeyDown={handleCardKeyDown}
      aria-label={
        canOpenDetailsFromCard
          ? `Open details for ${game.schoolName} on ${formatGameDate(game.dateISO)}`
          : undefined
      }
    >
      <div className="game-card-header">
        <h3>{game.schoolName}</h3>
        <span className="pay-pill">Posted: {formatCurrency(game.payPosted)}</span>
      </div>

      <p className="meta-line">
        <strong>{game.sport}</strong> • {game.level}
      </p>
      <p className="meta-line">{formatGameDate(game.dateISO)}</p>
      {game.acceptingBidsUntilISO ? (
        <p className="meta-line">
          Accepting bids until: {formatGameDate(game.acceptingBidsUntilISO)}
        </p>
      ) : null}
      <p className="meta-line">{game.location}</p>
      <p className="meta-line">Posted by {game.createdByRole}</p>
      <p className="meta-line status-line">
        Status: <strong>{game.status === "awarded" ? "Awarded" : "Open"}</strong>
      </p>
      {isDirectAssignment ? (
        <p className="meta-line">
          Direct assignments: <strong>{directAssignmentCount}</strong>
        </p>
      ) : (
        <>
          <p className="meta-line">
            Total bids: <strong>{totalBidCount}</strong>
          </p>
          <p className={`meta-line bid-window bid-window-${bidWindowInfo.state}`}>
            Bid window: <strong>{bidWindowInfo.label}</strong>
          </p>
          <p className="meta-line">
            Highest bid: <strong>{highestBidAmount ? formatCurrency(highestBidAmount) : "-"}</strong>
          </p>
        </>
      )}
      {game.notes ? <p className="notes">Notes: {game.notes}</p> : null}

      <div className="card-actions">
        {role === "official" ? (
          <button
            type="button"
            onClick={() => setShowBidForm((prev) => !prev)}
            disabled={!canPlaceBid}
          >
            {showBidForm ? "Close" : "Place / Update Bid"}
          </button>
        ) : null}

        {canManageGame ? (
          <button
            type="button"
            className="button-secondary"
            onClick={() => setShowEditForm((prev) => !prev)}
          >
            {showEditForm ? "Close Edit" : "Edit Game"}
          </button>
        ) : null}
      </div>

      {showBidForm ? (
        <BidForm
          postedPay={game.payPosted}
          defaultOfficialName={currentUserName}
          availableCrews={availableCrews}
          existingBids={officialBidsForGame}
          onSubmit={handleBidSubmit}
          onCancel={() => setShowBidForm(false)}
        />
      ) : null}

      {placeBidDisabledReason ? (
        <p className="hint-text">{placeBidDisabledReason}</p>
      ) : null}

      {highestUserBid !== null && role === "official" ? (
        <p className="hint-text">
          Your highest active offer: <strong>{formatCurrency(highestUserBid)}</strong>
        </p>
      ) : null}

      {canOpenDetailsFromCard ? (
        <p className="hint-text">Select this card to view full game details.</p>
      ) : null}

      {showEditForm ? (
        <EditGameForm
          game={game}
          onSubmit={handleGameUpdate}
          onCancel={() => setShowEditForm(false)}
        />
      ) : null}

      {role === "official" && !isDirectAssignment ? (
        <section className="bids-section">
          <h4>Your bids on this game</h4>
          {gameBids.length === 0 ? (
            <p className="empty-text">No bids yet.</p>
          ) : (
            <ul className="bid-list">
              {gameBids.map((bid) => {
                const canDeleteBid = bid.officialUid === currentUserId;

                return (
                  <li key={bid.id} className="bid-item">
                    <div>
                      <strong>{formatCurrency(bid.amount)}</strong>{" "}
                      {bid.bidderType === "crew" && bid.crewName
                        ? `as ${bid.crewName}`
                        : "as Individual"}
                    </div>
                    <div className="meta-line">{formatGameDate(bid.createdAtISO)}</div>
                    <div className="meta-line">Entered by: {bid.officialName}</div>
                    {bid.message ? <div className="meta-line">Message: {bid.message}</div> : null}

                    {canDeleteBid ? (
                      <button
                        type="button"
                        className="button-link-danger"
                        onClick={() => handleDeleteBid(bid.id)}
                        disabled={busyBidId === bid.id}
                      >
                        {busyBidId === bid.id ? "Deleting..." : "Delete"}
                      </button>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      ) : null}
    </article>
  );
}

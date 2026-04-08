import { CalendarDays, Clock3, Gavel, MapPin, Shield, Wallet } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { EditGameForm } from "./EditGameForm";
import { isBidEditableByOfficial, requiresCrewBidForGame } from "../lib/bids";
import {
  formatCurrency,
  formatGameDate,
  getBidWindowInfo,
  getGameStatusLabel
} from "../lib/format";
import type { Bid, Crew, Game, UserRole } from "../types";

interface GameCardProps {
  game: Game;
  bids: Bid[];
  role: UserRole;
  currentUserId: string;
  availableCrews: Crew[];
  userDistanceMiles?: number | null;
  distanceUnavailableLabel?: string;
  canManageGame: boolean;
  onDeleteBid: (bidId: string) => Promise<void>;
  onUpdateGame: (
    gameId: string,
    input: {
      schoolName: string;
      sport: Game["sport"];
      level: Game["level"];
      requestedCrewSize: number;
      dateISO: string;
      scheduledDateKey: string;
      acceptingBidsUntilISO?: string;
      location: string;
      payPosted: number;
      notes?: string;
    }
  ) => Promise<void>;
  layout?: "grid" | "list";
}

export function GameCard({
  game,
  bids,
  role,
  currentUserId,
  availableCrews,
  userDistanceMiles,
  distanceUnavailableLabel,
  canManageGame,
  onDeleteBid,
  onUpdateGame,
  layout = "grid"
}: GameCardProps) {
  const navigate = useNavigate();
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
  const requiresCrewBid = requiresCrewBidForGame(game);
  const directAssignmentCount = game.directAssignments?.length ?? 0;
  const statusLabel = getGameStatusLabel(game.status, game.mode);

  const officialBidsForGame = useMemo(
    () =>
      allGameBids.filter((bid) =>
        isBidEditableByOfficial(
          bid,
          currentUserId,
          availableCrews.map((crew) => crew.id)
        )
      ),
    [allGameBids, availableCrews, currentUserId]
  );

  const latestUserBid = officialBidsForGame[0] ?? null;
  const canDeleteLatestUserBid = latestUserBid
    ? isBidEditableByOfficial(
        latestUserBid,
        currentUserId,
        availableCrews.map((crew) => crew.id)
      )
    : false;

  const gameBids = useMemo(() => {
    if (role === "official") {
      return officialBidsForGame;
    }

    return [];
  }, [officialBidsForGame, role]);

  const canOpenDetailsFromCard = true;
  const schoolMonogram = game.schoolName
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join("");

  function openDetails() {
    navigate(`/schedule/games/${game.id}`, {
      state: { from: "marketplace" }
    });
  }

  function handleCardClick(event: React.MouseEvent<HTMLElement>) {
    if (!canOpenDetailsFromCard) {
      return;
    }

    const target = event.target as HTMLElement;
    if (target.closest("button, input, textarea, [role='combobox'], form, a")) {
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
    if (target.closest("button, input, textarea, [role='combobox'], form, a")) {
      return;
    }

    event.preventDefault();
    openDetails();
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
    requestedCrewSize: number;
    dateISO: string;
    scheduledDateKey: string;
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
      className={`game-card market-game-card${
        canOpenDetailsFromCard ? " clickable-game-card" : ""
      }${layout === "list" ? " market-game-card-list" : ""}`}
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
      <div className={layout === "list" ? "game-card-list-shell" : ""}>
        {layout === "list" ? (
          <div className="game-card-list-brand">
            <div className="game-card-school-mark">{schoolMonogram || "GM"}</div>
            <div className="game-card-list-main">
              <div className="game-card-flags">
                <span
                  className={`game-card-flag ${
                    game.mode === "direct_assignment" || game.status === "awarded"
                      ? "game-card-flag-awarded"
                      : "game-card-flag-open"
                  }`}
                >
                  {statusLabel}
                </span>
                {!isDirectAssignment ? (
                  <span className={`game-card-flag game-card-flag-window-${bidWindowInfo.state}`}>
                    {`Bid Window: ${bidWindowInfo.label}`}
                  </span>
                ) : null}
                {requiresCrewBid ? (
                  <span className="game-card-flag game-card-flag-varsity">CREW BID REQUIRED</span>
                ) : null}
              </div>

              <div className="game-card-header">
                <div>
                  <h3>{game.schoolName}</h3>
                  <p className="meta-line game-card-sport-line">
                    <strong>{game.sport}</strong> • {game.level}
                  </p>
                </div>
              </div>

              <div className="game-card-market-meta">
                <p className="meta-line">
                  <CalendarDays aria-hidden="true" /> {formatGameDate(game.dateISO)}
                </p>
                {!isDirectAssignment && game.acceptingBidsUntilISO ? (
                  <p className="meta-line">
                    <Clock3 aria-hidden="true" /> {formatGameDate(game.acceptingBidsUntilISO)}
                  </p>
                ) : null}
                <p className="meta-line">
                  <MapPin aria-hidden="true" /> {game.location}
                </p>
                {game.requestedCrewSize ? (
                <p className="meta-line">
                    <Shield aria-hidden="true" /> Crew of {game.requestedCrewSize}
                  </p>
                ) : null}
                {role === "official" ? (
                  <p className="meta-line">
                    <Shield aria-hidden="true" />{" "}
                    {typeof userDistanceMiles === "number" && Number.isFinite(userDistanceMiles)
                      ? `${userDistanceMiles.toFixed(1)} mi away`
                      : userDistanceMiles === null
                        ? (distanceUnavailableLabel ?? "N/A")
                        : "Calculating distance"}
                  </p>
                ) : null}
                <p className="meta-line">
                  <Gavel aria-hidden="true" />{" "}
                  {isDirectAssignment
                    ? `${directAssignmentCount} direct assignment(s)`
                    : `${totalBidCount} bid(s) • Highest ${
                        highestBidAmount ? formatCurrency(highestBidAmount) : "-"
                      }`}
                </p>
              </div>

              {game.notes ? <p className="notes">{game.notes}</p> : null}
            </div>
          </div>
        ) : (
          <>
            <div className="game-card-flags">
              <span
                className={`game-card-flag ${
                  game.mode === "direct_assignment" || game.status === "awarded"
                    ? "game-card-flag-awarded"
                    : "game-card-flag-open"
                }`}
              >
                {statusLabel}
              </span>
              {!isDirectAssignment ? (
                <span className={`game-card-flag game-card-flag-window-${bidWindowInfo.state}`}>
                  {`Bid Window: ${bidWindowInfo.label}`}
                </span>
              ) : null}
              {requiresCrewBid ? (
                <span className="game-card-flag game-card-flag-varsity">CREW BID REQUIRED</span>
              ) : null}
            </div>

            <div className="game-card-header">
              <h3>{game.schoolName}</h3>
              <span className="pay-pill">Posted: {formatCurrency(game.payPosted)}</span>
            </div>

            <p className="meta-line game-card-sport-line">
              <strong>{game.sport}</strong> • {game.level}
            </p>
            <div className="game-card-meta-grid">
              <p className="meta-line">{formatGameDate(game.dateISO)}</p>
              {!isDirectAssignment && game.acceptingBidsUntilISO ? (
                <p className="meta-line">
                  Accepting bids until: {formatGameDate(game.acceptingBidsUntilISO)}
                </p>
              ) : null}
              <p className="meta-line">{game.location}</p>
              {game.requestedCrewSize ? (
                <p className="meta-line">
                  Crew of <strong>{game.requestedCrewSize}</strong>
                </p>
              ) : null}
              {role === "official" ? (
                <p className="meta-line">
                  Distance:{" "}
                  <strong>
                    {typeof userDistanceMiles === "number" && Number.isFinite(userDistanceMiles)
                      ? `${userDistanceMiles.toFixed(1)} mi`
                      : userDistanceMiles === null
                        ? (distanceUnavailableLabel ?? "N/A")
                        : "Calculating..."}
                  </strong>
                </p>
              ) : null}
              <p className="meta-line">Posted by {game.createdByRole}</p>
              {isDirectAssignment ? (
                <p className="meta-line">
                  Direct assignments: <strong>{directAssignmentCount}</strong>
                </p>
              ) : (
                <>
                  <p className="meta-line">
                    Total bids: <strong>{totalBidCount}</strong>
                  </p>
                  <p className="meta-line">
                    Highest bid:{" "}
                    <strong>{highestBidAmount ? formatCurrency(highestBidAmount) : "-"}</strong>
                  </p>
                </>
              )}
            </div>
            {game.notes ? <p className="notes">Notes: {game.notes}</p> : null}
          </>
        )}

        <div className={layout === "list" ? "game-card-list-aside" : ""}>
          {layout === "list" ? (
            <div className="game-card-list-price-panel">
              <span className="game-card-price-label">
                <Wallet aria-hidden="true" /> Posted pay
              </span>
              <strong className="game-card-price-value">
                {formatCurrency(game.payPosted)}
              </strong>
              <span className="game-card-price-subtext">
                Posted by {game.createdByRole}
              </span>
            </div>
          ) : null}

          <div className="card-actions">
            {role === "official" && layout === "grid" && latestUserBid && canDeleteLatestUserBid ? (
              <button
                type="button"
                className="button-secondary"
                onClick={() => void handleDeleteBid(latestUserBid.id)}
                disabled={busyBidId === latestUserBid.id}
              >
                {busyBidId === latestUserBid.id ? "Deleting..." : "Delete"}
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

          {layout === "list" ? (
            <p className="hint-text game-card-list-hint">Open listing details for full bid history.</p>
          ) : null}
        </div>
      </div>

      {latestUserBid && role === "official" ? (
        <p className="hint-text">
          Your Bid: <strong>{formatCurrency(latestUserBid.amount)}</strong>
          {latestUserBid.bidderType === "crew" && latestUserBid.crewName
            ? ` as ${latestUserBid.crewName}`
            : ""}
        </p>
      ) : null}

      {layout !== "list" ? (
        <p className="hint-text">Select this card to view full game details.</p>
      ) : null}

      {showEditForm ? (
        <EditGameForm
          game={game}
          onSubmit={handleGameUpdate}
          onCancel={() => setShowEditForm(false)}
        />
      ) : null}

      {role === "official" && !isDirectAssignment && layout === "list" ? (
        <section className="bids-section">
          <h4>Your bids on this game</h4>
          {gameBids.length === 0 ? (
            <p className="empty-text">No bids yet.</p>
          ) : (
            <ul className="bid-list">
              {gameBids.map((bid) => {
                const canDeleteBid = isBidEditableByOfficial(
                  bid,
                  currentUserId,
                  availableCrews.map((crew) => crew.id)
                );

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

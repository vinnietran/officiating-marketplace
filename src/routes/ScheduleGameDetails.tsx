import { Fragment, useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { AuthPanel } from "../components/AuthPanel";
import { CompleteProfilePanel } from "../components/CompleteProfilePanel";
import { MessageModal } from "../components/MessageModal";
import { useAuth } from "../context/AuthContext";
import { formatCurrency, formatGameDate, getBidWindowInfo } from "../lib/format";
import {
  deleteGame,
  selectBid,
  subscribeBids,
  subscribeCrews,
  subscribeGames,
  subscribeRatingsForGame,
  upsertGameRating
} from "../lib/firestore";
import { FIRESTORE_DATABASE_ID } from "../lib/firebase";
import { getReadableFirestoreError } from "../lib/firebaseErrors";
import type { Bid, Crew, Game, Rating, RatingTargetType } from "../types";

function getBidderLabel(bid: Bid): string {
  if (bid.bidderType === "crew" && bid.crewName) {
    return `${bid.crewName} (Crew)`;
  }
  return `${bid.officialName} (Individual)`;
}

function getDirectAssignmentDisplay(game: Game): string {
  const assignments = game.directAssignments ?? [];
  if (assignments.length === 0) {
    return "None";
  }
  if (assignments.length === 1) {
    const assignment = assignments[0];
    if (assignment.assignmentType === "crew") {
      return `${assignment.crewName} (Crew)`;
    }
    return assignment.officialName;
  }
  return `${assignments.length} assignees`;
}

interface RateableTarget {
  targetType: RatingTargetType;
  targetId: string;
  targetName: string;
  detail: string;
}

function toTargetKey(targetType: RatingTargetType, targetId: string): string {
  return `${targetType}:${targetId}`;
}

export function ScheduleGameDetails() {
  const { gameId } = useParams<{ gameId: string }>();
  const navigate = useNavigate();
  const { user, profile, loading, profileLoading } = useAuth();

  const [games, setGames] = useState<Game[]>([]);
  const [bids, setBids] = useState<Bid[]>([]);
  const [crews, setCrews] = useState<Crew[]>([]);
  const [ratings, setRatings] = useState<Rating[]>([]);
  const [dataError, setDataError] = useState<string | null>(null);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [busyBidId, setBusyBidId] = useState<string | null>(null);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [deletingGame, setDeletingGame] = useState(false);
  const [editingRatingKey, setEditingRatingKey] = useState<string | null>(null);
  const [ratingStars, setRatingStars] = useState("5");
  const [ratingComment, setRatingComment] = useState("");
  const [ratingError, setRatingError] = useState<string | null>(null);
  const [savingRating, setSavingRating] = useState(false);
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
    const unsubscribeRatings = gameId
      ? subscribeRatingsForGame(gameId, setRatings, (error) =>
          setDataError(getReadableFirestoreError(error, FIRESTORE_DATABASE_ID))
        )
      : () => undefined;

    return () => {
      unsubscribeGames();
      unsubscribeBids();
      unsubscribeCrews();
      unsubscribeRatings();
    };
  }, [gameId, user]);

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
  const selectedBid = useMemo(() => {
    if (!game?.selectedBidId) {
      return null;
    }
    return gameBids.find((bid) => bid.id === game.selectedBidId) ?? null;
  }, [game?.selectedBidId, gameBids]);
  const selectedBidCrew =
    selectedBid?.bidderType === "crew" && selectedBid.crewId
      ? crews.find((crew) => crew.id === selectedBid.crewId) ?? null
      : null;

  const rateableTargets = useMemo(() => {
    if (!game) {
      return [];
    }

    const targets = new Map<string, RateableTarget>();
    const addTarget = (target: RateableTarget) => {
      const key = toTargetKey(target.targetType, target.targetId);
      if (!targets.has(key)) {
        targets.set(key, target);
      }
    };

    if (game.mode === "direct_assignment") {
      (game.directAssignments ?? []).forEach((assignment) => {
        if (assignment.assignmentType === "individual") {
          addTarget({
            targetType: "official",
            targetId: assignment.officialUid,
            targetName: assignment.officialName,
            detail: assignment.officialEmail
          });
          return;
        }

        addTarget({
          targetType: "crew",
          targetId: assignment.crewId,
          targetName: assignment.crewName,
          detail: `${assignment.memberUids.length} members`
        });

        assignment.memberUids.forEach((memberUid, index) => {
          addTarget({
            targetType: "official",
            targetId: memberUid,
            targetName: assignment.memberNames[index] ?? "Official",
            detail: `Crew: ${assignment.crewName}`
          });
        });
      });
      return Array.from(targets.values());
    }

    if (!selectedBid) {
      return [];
    }

    if (selectedBid.bidderType === "crew" && selectedBid.crewId) {
      addTarget({
        targetType: "crew",
        targetId: selectedBid.crewId,
        targetName: selectedBid.crewName ?? "Crew",
        detail: selectedBidCrew
          ? `${selectedBidCrew.members.length} members`
          : "Crew bid selected"
      });

      if (selectedBidCrew) {
        selectedBidCrew.members.forEach((member) => {
          addTarget({
            targetType: "official",
            targetId: member.uid,
            targetName: member.name,
            detail: member.email
          });
        });
      }

      return Array.from(targets.values());
    }

    addTarget({
      targetType: "official",
      targetId: selectedBid.officialUid,
      targetName: selectedBid.officialName,
      detail: "Selected bid"
    });

    return Array.from(targets.values());
  }, [game, selectedBid, selectedBidCrew]);

  const activeUserId = user?.uid ?? "";
  const myRatingsByTargetKey = useMemo(() => {
    const map = new Map<string, Rating>();
    ratings
      .filter((rating) => rating.ratedByUid === activeUserId)
      .forEach((rating) => {
        map.set(toTargetKey(rating.targetType, rating.targetId), rating);
      });
    return map;
  }, [activeUserId, ratings]);

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

  const activeUser = user;
  const activeProfile = profile;
  const activeRaterRole: "assignor" | "school" =
    activeProfile.role === "assignor" ? "assignor" : "school";
  const activeGame = game;
  const isDirectAssignment = activeGame.mode === "direct_assignment";
  const gameHasBeenPlayed = new Date(activeGame.dateISO).getTime() <= nowMs;
  const canRateThisGame = gameHasBeenPlayed && activeGame.status === "awarded";
  const bidWindowInfo = getBidWindowInfo(
    activeGame.acceptingBidsUntilISO,
    activeGame.status,
    nowMs
  );

  async function handleSelectBid(bidId: string) {
    if (isDirectAssignment) {
      setModalMessage({
        title: "Direct Assignment",
        message: "This game was directly assigned and does not use bid selection."
      });
      return;
    }

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

  async function handleDeleteGame() {
    setDeletingGame(true);
    try {
      await deleteGame(activeGame.id);
      navigate("/schedule", { replace: true });
    } catch (error) {
      setDataError(getReadableFirestoreError(error, FIRESTORE_DATABASE_ID));
      setDeleteConfirmOpen(false);
    } finally {
      setDeletingGame(false);
    }
  }

  function beginRating(target: RateableTarget) {
    const key = toTargetKey(target.targetType, target.targetId);
    const existing = myRatingsByTargetKey.get(key);
    setEditingRatingKey(key);
    setRatingStars(existing ? String(existing.stars) : "5");
    setRatingComment(existing?.comment ?? "");
    setRatingError(null);
  }

  async function handleSaveRating(target: RateableTarget) {
    const parsedStars = Number(ratingStars);
    if (!Number.isInteger(parsedStars) || parsedStars < 1 || parsedStars > 5) {
      setRatingError("Rating must be a whole number from 1 to 5.");
      return;
    }

    setSavingRating(true);
    setRatingError(null);
    try {
      await upsertGameRating(
        {
          gameId: activeGame.id,
          targetType: target.targetType,
          targetId: target.targetId,
          stars: parsedStars,
          comment: ratingComment.trim() || undefined
        },
        {
          uid: activeUser.uid,
          role: activeRaterRole
        }
      );

      setModalMessage({
        title: "Rating Saved",
        message: `Saved ${parsedStars}/5 for ${target.targetName}.`
      });
      setEditingRatingKey(null);
    } catch (error) {
      setRatingError(getReadableFirestoreError(error, FIRESTORE_DATABASE_ID));
    } finally {
      setSavingRating(false);
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

      <div className="details-top-actions">
        <Link to="/schedule" className="button-secondary details-back-link">
          Back to Schedule
        </Link>
        <button
          type="button"
          className="button-danger"
          onClick={() => setDeleteConfirmOpen(true)}
          disabled={deletingGame}
        >
          Delete Game
        </button>
      </div>

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
          <h3>{isDirectAssignment ? "Assignment Snapshot" : "Bidding Snapshot"}</h3>
          {isDirectAssignment ? (
            <>
              <p className="meta-line">
                Assigned to: {getDirectAssignmentDisplay(activeGame)}
              </p>
              <p className="meta-line">
                Total assignees: {(activeGame.directAssignments ?? []).length}
              </p>
              <p className="meta-line">
                Game fee: {formatCurrency(activeGame.payPosted)}
              </p>
            </>
          ) : (
            <>
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
            </>
          )}
        </article>
      </section>

      {isDirectAssignment ? (
        <section className="schedule-table-wrapper">
          <table className="schedule-table">
            <thead>
              <tr>
                <th>Type</th>
                <th>Assignee</th>
                <th>Position</th>
                <th>Members</th>
              </tr>
            </thead>
            <tbody>
              {(activeGame.directAssignments ?? []).length === 0 ? (
                <tr>
                  <td colSpan={4}>No assignments found.</td>
                </tr>
              ) : (
                (activeGame.directAssignments ?? []).map((assignment, index) => (
                  <tr key={`${assignment.assignmentType}-${index}`}>
                    <td>
                      {assignment.assignmentType === "crew" ? "Crew" : "Individual"}
                    </td>
                    <td>
                      {assignment.assignmentType === "crew"
                        ? assignment.crewName
                        : assignment.officialName}
                    </td>
                    <td>
                      {assignment.assignmentType === "individual"
                        ? assignment.position ?? "-"
                        : "-"}
                    </td>
                    <td>
                      {assignment.assignmentType === "crew"
                        ? assignment.memberNames.join(", ")
                        : assignment.officialEmail}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </section>
      ) : (
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
      )}

      <section className="details-card">
        <h3>Post-Game Ratings</h3>
        {!canRateThisGame ? (
          <p className="empty-text">
            Ratings become available after game time and once the game is awarded.
          </p>
        ) : rateableTargets.length === 0 ? (
          <p className="empty-text">No assignable official or crew found for rating.</p>
        ) : (
          <div className="schedule-table-wrapper">
            <table className="schedule-table">
              <thead>
                <tr>
                  <th>Target</th>
                  <th>Type</th>
                  <th>Details</th>
                  <th>Your Rating</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {rateableTargets.map((target) => {
                  const targetKey = toTargetKey(target.targetType, target.targetId);
                  const existingRating = myRatingsByTargetKey.get(targetKey) ?? null;
                  const isEditing = editingRatingKey === targetKey;

                  return (
                    <Fragment key={targetKey}>
                      <tr>
                        <td>{target.targetName}</td>
                        <td>{target.targetType === "crew" ? "Crew" : "Official"}</td>
                        <td>{target.detail}</td>
                        <td>{existingRating ? `${existingRating.stars}/5` : "-"}</td>
                        <td>
                          <button
                            type="button"
                            className="button-secondary"
                            onClick={() => beginRating(target)}
                            disabled={savingRating}
                          >
                            {existingRating ? "Update" : "Rate"}
                          </button>
                        </td>
                      </tr>
                      {isEditing ? (
                        <tr className="rating-edit-row">
                          <td colSpan={5}>
                            <div className="rating-edit-grid">
                              <label>
                                Stars
                                <select
                                  value={ratingStars}
                                  onChange={(event) => setRatingStars(event.target.value)}
                                  disabled={savingRating}
                                >
                                  <option value="5">5</option>
                                  <option value="4">4</option>
                                  <option value="3">3</option>
                                  <option value="2">2</option>
                                  <option value="1">1</option>
                                </select>
                              </label>
                              <label>
                                Comment (Optional)
                                <textarea
                                  rows={2}
                                  maxLength={200}
                                  value={ratingComment}
                                  onChange={(event) => setRatingComment(event.target.value)}
                                  disabled={savingRating}
                                />
                              </label>
                              {ratingError ? <p className="error-text">{ratingError}</p> : null}
                              <div className="bid-form-actions">
                                <button
                                  type="button"
                                  onClick={() => handleSaveRating(target)}
                                  disabled={savingRating}
                                >
                                  {savingRating ? "Saving..." : "Save Rating"}
                                </button>
                                <button
                                  type="button"
                                  className="button-secondary"
                                  onClick={() => {
                                    if (!savingRating) {
                                      setEditingRatingKey(null);
                                      setRatingError(null);
                                    }
                                  }}
                                  disabled={savingRating}
                                >
                                  Cancel
                                </button>
                              </div>
                            </div>
                          </td>
                        </tr>
                      ) : null}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {modalMessage ? (
        <MessageModal
          title={modalMessage.title}
          message={modalMessage.message}
          onClose={() => setModalMessage(null)}
        />
      ) : null}

      {deleteConfirmOpen ? (
        <MessageModal
          title="Delete Game"
          message="This will permanently delete this game and all bids for it. This action cannot be undone."
          onClose={() => {
            if (!deletingGame) {
              setDeleteConfirmOpen(false);
            }
          }}
          onConfirm={handleDeleteGame}
          confirmTone="danger"
          confirmLabel={deletingGame ? "Deleting..." : "Delete Game"}
          confirmDisabled={deletingGame}
          cancelDisabled={deletingGame}
        />
      ) : null}
    </main>
  );
}

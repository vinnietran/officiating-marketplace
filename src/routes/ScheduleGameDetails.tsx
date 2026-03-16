import { Fragment, useEffect, useMemo, useState, type FormEvent } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import { AuthPanel } from "../components/AuthPanel";
import { BidForm } from "../components/BidForm";
import { CompleteProfilePanel } from "../components/CompleteProfilePanel";
import { MessageModal } from "../components/MessageModal";
import { Select } from "../components/ui/Select";
import { useAuth } from "../context/AuthContext";
import {
  findActiveBid,
  getBidEligibleCrews,
  getCrewMemberCrews,
  requiresCrewBidForGame
} from "../lib/bids";
import {
  formatCurrency,
  formatGameDate,
  getBidWindowInfo,
  getGameStatusLabel
} from "../lib/format";
import {
  createBid,
  deleteGame,
  selectBid,
  subscribeBids,
  subscribeCrews,
  subscribeEvaluationsForGame,
  subscribeGames,
  subscribeRatingsForGame,
  updateBid,
  upsertGameEvaluation,
  upsertGameRating
} from "../lib/firestore";
import { FIRESTORE_DATABASE_ID } from "../lib/firebase";
import { getReadableFirestoreError } from "../lib/firebaseErrors";
import type {
  Bid,
  Crew,
  Evaluation,
  FootballPosition,
  Game,
  Rating,
  RatingTargetType
} from "../types";

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

interface DetailsRouteState {
  from?: "marketplace" | "schedule";
}

interface AssignedIndividual {
  uid: string;
  name: string;
  crew: string;
  position: string;
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

function toPositionLabel(position?: FootballPosition): string {
  if (!position) {
    return "Unassigned";
  }

  return `${FOOTBALL_POSITION_LABELS[position]} (${position})`;
}

function toTargetKey(targetType: RatingTargetType, targetId: string): string {
  return `${targetType}:${targetId}`;
}

function getRatingTargetTypeLabel(targetType: RatingTargetType): string {
  if (targetType === "crew") {
    return "Crew";
  }
  if (targetType === "school") {
    return "School";
  }
  if (targetType === "venue") {
    return "Venue";
  }
  return "Official";
}

export function ScheduleGameDetails() {
  const { gameId } = useParams<{ gameId: string }>();
  const location = useLocation();
  const navigate = useNavigate();
  const { user, profile, loading, profileLoading } = useAuth();

  const [games, setGames] = useState<Game[]>([]);
  const [bids, setBids] = useState<Bid[]>([]);
  const [crews, setCrews] = useState<Crew[]>([]);
  const [ratings, setRatings] = useState<Rating[]>([]);
  const [evaluations, setEvaluations] = useState<Evaluation[]>([]);
  const [dataError, setDataError] = useState<string | null>(null);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [showBidForm, setShowBidForm] = useState(false);
  const [showEvaluationForm, setShowEvaluationForm] = useState(false);
  const [busyBidId, setBusyBidId] = useState<string | null>(null);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [deletingGame, setDeletingGame] = useState(false);
  const [editingRatingKey, setEditingRatingKey] = useState<string | null>(null);
  const [ratingStars, setRatingStars] = useState("5");
  const [ratingComment, setRatingComment] = useState("");
  const [ratingError, setRatingError] = useState<string | null>(null);
  const [savingRating, setSavingRating] = useState(false);
  const [evaluationScore, setEvaluationScore] = useState("3");
  const [evaluationNotes, setEvaluationNotes] = useState("");
  const [evaluationError, setEvaluationError] = useState<string | null>(null);
  const [savingEvaluation, setSavingEvaluation] = useState(false);
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
      setEvaluations([]);
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
    const unsubscribeEvaluations = gameId
      ? subscribeEvaluationsForGame(gameId, setEvaluations, (error) =>
          setDataError(getReadableFirestoreError(error, FIRESTORE_DATABASE_ID))
        )
      : () => undefined;

    return () => {
      unsubscribeGames();
      unsubscribeBids();
      unsubscribeCrews();
      unsubscribeRatings();
      unsubscribeEvaluations();
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
  const activeUserId = user?.uid ?? "";

  const memberCrews = useMemo(() => {
    if (!user || profile?.role !== "official") {
      return [];
    }
    return getCrewMemberCrews(crews, user.uid);
  }, [crews, profile?.role, user]);

  const officialCrews = useMemo(() => {
    if (!user || profile?.role !== "official") {
      return [];
    }
    return getBidEligibleCrews(memberCrews, user.uid);
  }, [memberCrews, profile?.role, user]);

  const officialBidsForGame = useMemo(() => {
    if (!user || profile?.role !== "official") {
      return [];
    }
    return gameBids.filter((bid) => bid.officialUid === user.uid);
  }, [gameBids, profile?.role, user]);

  const assignedIndividuals = useMemo<AssignedIndividual[]>(() => {
    if (!game || game.status !== "awarded") {
      return [];
    }

    const assignedByKey = new Map<string, AssignedIndividual>();
    const addAssignedIndividual = (entry: AssignedIndividual) => {
      const key = entry.uid ? `uid:${entry.uid}` : `name:${entry.name.toLowerCase()}`;
      if (!assignedByKey.has(key)) {
        assignedByKey.set(key, entry);
      }
    };

    if (game.mode === "direct_assignment") {
      (game.directAssignments ?? []).forEach((assignment) => {
        if (assignment.assignmentType === "individual") {
          addAssignedIndividual({
            uid: assignment.officialUid,
            name: assignment.officialName,
            crew: "Individual",
            position: toPositionLabel(assignment.position)
          });
          return;
        }

        const assignmentCrew = crews.find((crew) => crew.id === assignment.crewId) ?? null;
        assignment.memberUids.forEach((memberUid, index) => {
          addAssignedIndividual({
            uid: memberUid,
            name: assignment.memberNames[index] ?? "Official",
            crew: assignment.crewName,
            position: toPositionLabel(assignmentCrew?.memberPositions?.[memberUid])
          });
        });
      });

      return Array.from(assignedByKey.values()).sort((a, b) => a.name.localeCompare(b.name));
    }

    if (!selectedBid) {
      return [];
    }

    if (selectedBid.bidderType === "crew" && selectedBid.crewId) {
      if (selectedBidCrew) {
        selectedBidCrew.members.forEach((member) => {
          addAssignedIndividual({
            uid: member.uid,
            name: member.name,
            crew: selectedBid.crewName ?? selectedBidCrew.name,
            position: toPositionLabel(selectedBidCrew.memberPositions[member.uid])
          });
        });
      } else {
        addAssignedIndividual({
          uid: selectedBid.officialUid,
          name: selectedBid.officialName,
          crew: selectedBid.crewName ?? "Crew",
          position: toPositionLabel()
        });
      }

      return Array.from(assignedByKey.values()).sort((a, b) => a.name.localeCompare(b.name));
    }

    addAssignedIndividual({
      uid: selectedBid.officialUid,
      name: selectedBid.officialName,
      crew: "Individual",
      position: toPositionLabel()
    });

    return Array.from(assignedByKey.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [crews, game, selectedBid, selectedBidCrew]);

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

  const officialSchoolVenueTargets = useMemo<RateableTarget[]>(() => {
    if (!game) {
      return [];
    }

    const normalizedVenueId = game.location.trim().toLowerCase();
    return [
      {
        targetType: "school",
        targetId: game.createdByUid,
        targetName: game.schoolName,
        detail: `Posted by ${game.createdByRole}`
      },
      {
        targetType: "venue",
        targetId: normalizedVenueId || game.id,
        targetName: game.location,
        detail: "Game venue"
      }
    ];
  }, [game]);

  const myRatingsByTargetKey = useMemo(() => {
    const map = new Map<string, Rating>();
    ratings
      .filter((rating) => rating.ratedByUid === activeUserId)
      .forEach((rating) => {
        map.set(toTargetKey(rating.targetType, rating.targetId), rating);
      });
    return map;
  }, [activeUserId, ratings]);

  const myEvaluation = useMemo(() => {
    return evaluations.find((evaluation) => evaluation.evaluatorUid === activeUserId) ?? null;
  }, [activeUserId, evaluations]);

  useEffect(() => {
    if (profile?.role !== "evaluator") {
      return;
    }

    setEvaluationScore(myEvaluation ? String(myEvaluation.overallScore) : "3");
    setEvaluationNotes(myEvaluation?.notes ?? "");
  }, [myEvaluation, profile?.role]);

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

  const routeState = location.state as DetailsRouteState | null;
  const backPath = routeState?.from === "marketplace" ? "/marketplace" : "/schedule";
  const backLabel = backPath === "/marketplace" ? "Back to Marketplace" : "Back to Schedule";

  if (!game) {
    return (
      <main className="page">
        <header className="hero">
          <h1>Game Details</h1>
          <p>Game not found.</p>
        </header>
        <Link to={backPath} className="button-secondary details-back-link">
          {backLabel}
        </Link>
      </main>
    );
  }

  const activeUser = user;
  const activeProfile = profile;
  const activeGame = game;
  const isEvaluator = activeProfile.role === "evaluator";
  const canManageGame =
    (activeProfile.role === "assignor" || activeProfile.role === "school") &&
    activeGame.createdByUid === activeUser.uid;
  const activeRaterRole: "assignor" | "school" | null = canManageGame
    ? activeProfile.role === "assignor"
      ? "assignor"
      : "school"
    : null;
  const isDirectAssignment = activeGame.mode === "direct_assignment";
  const statusLabel = getGameStatusLabel(activeGame.status, activeGame.mode);
  const requiresCrewBid = requiresCrewBidForGame(activeGame);
  const isAssignedOfficial =
    activeProfile.role === "official" &&
    assignedIndividuals.some((entry) => entry.uid === activeUser.uid);
  const canViewAwardedDetails =
    activeGame.status !== "awarded" || canManageGame || isAssignedOfficial || isEvaluator;
  const shouldShowAssignmentSnapshot = isDirectAssignment || activeGame.status === "awarded";
  const awardedFee = isDirectAssignment
    ? activeGame.payPosted
    : selectedBid
      ? selectedBid.amount
      : activeGame.payPosted;
  const gameHasBeenPlayed = new Date(activeGame.dateISO).getTime() <= nowMs;
  const canOfficialRateSchoolOrVenue =
    activeProfile.role === "official" &&
    isAssignedOfficial &&
    gameHasBeenPlayed &&
    activeGame.status === "awarded";
  const canSubmitRatings = canManageGame || canOfficialRateSchoolOrVenue;
  const ratingTargets = canManageGame ? rateableTargets : officialSchoolVenueTargets;
  const bidWindowInfo = getBidWindowInfo(
    activeGame.acceptingBidsUntilISO,
    activeGame.status,
    nowMs
  );
  const placeBidDisabledReason =
    activeProfile.role !== "official"
      ? null
      : isDirectAssignment
        ? "This game was directly assigned. Bidding is not available."
        : activeGame.status !== "open"
          ? "Bidding is closed for this game."
          : bidWindowInfo.state === "closed"
            ? "The bidding window has closed."
            : requiresCrewBid && officialCrews.length === 0
              ? memberCrews.length > 0
                ? "You are a member of one or more crews, but you are not the Referee for any crew eligible to place this bid."
                : "Varsity games require crew bids. Join or create a crew to bid."
              : null;

  if (!canViewAwardedDetails) {
    return (
      <main className="page">
        <header className="hero">
          <h1>Game Details</h1>
          <p>Access restricted for awarded games.</p>
        </header>
        <p className="empty-text">
          Only assigned officials and the posting school or assignor can view this game.
        </p>
        <Link to={backPath} className="button-secondary details-back-link">
          {backLabel}
        </Link>
      </main>
    );
  }

  async function handleSelectBid(bidId: string) {
    if (!canManageGame) {
      setModalMessage({
        title: "Read-Only View",
        message: "Only the school or assignor who posted this game can select a bid."
      });
      return;
    }

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
    if (!canManageGame) {
      return;
    }

    setDeletingGame(true);
    try {
      await deleteGame(activeGame.id);
      navigate(backPath, { replace: true });
    } catch (error) {
      setDataError(getReadableFirestoreError(error, FIRESTORE_DATABASE_ID));
      setDeleteConfirmOpen(false);
    } finally {
      setDeletingGame(false);
    }
  }

  async function handleSubmitBid(input: {
    officialName: string;
    bidderType: "individual" | "crew";
    crewId?: string;
    crewName?: string;
    amount: number;
    message?: string;
  }) {
    if (activeProfile.role !== "official") {
      throw new Error("Only officials can place bids.");
    }

    if (activeGame.status !== "open" || bidWindowInfo.state === "closed") {
      throw new Error("Bidding is closed for this game.");
    }

    if (isDirectAssignment) {
      throw new Error("This game was directly assigned and cannot accept bids.");
    }
    if (requiresCrewBid && input.bidderType !== "crew") {
      throw new Error("Varsity games require crew bids.");
    }

    const selectedCrew =
      input.bidderType === "crew" && input.crewId
        ? officialCrews.find((crew) => crew.id === input.crewId) ?? null
        : null;

    if (input.bidderType === "crew" && !selectedCrew) {
      throw new Error("Only the Referee for this crew can place a crew bid.");
    }

    const latestIdentityBid = findActiveBid({
      bidderType: input.bidderType,
      existingBids: gameBids.filter((bid) => bid.officialUid === activeUser.uid),
      selectedCrewId: selectedCrew?.id ?? "",
      singleBidMode: false
    });

    if (latestIdentityBid) {
      if (input.amount <= latestIdentityBid.amount) {
        throw new Error("New offer must be higher than your current bid.");
      }

      await updateBid(latestIdentityBid.id, {
        officialName: input.officialName,
        bidderType: input.bidderType,
        crewId: selectedCrew?.id,
        crewName: selectedCrew?.name,
        amount: input.amount,
        message: input.message
      });
      setModalMessage({
        title: "Offer Increased",
        message: "Your bid was updated successfully."
      });
      return;
    }

    await createBid({
      gameId: activeGame.id,
      officialUid: activeUser.uid,
      officialName: input.officialName,
      bidderType: input.bidderType,
      crewId: selectedCrew?.id,
      crewName: selectedCrew?.name,
      amount: input.amount,
      message: input.message
    });
    setModalMessage({
      title: "Bid Submitted",
      message: "Your bid was submitted successfully."
    });
  }

  async function handleBidFormSubmit(input: {
    officialName: string;
    bidderType: "individual" | "crew";
    crewId?: string;
    crewName?: string;
    amount: number;
    message?: string;
  }) {
    await handleSubmitBid(input);
    setShowBidForm(false);
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
    const currentRaterRole: "assignor" | "school" | "official" | null =
      canManageGame && activeRaterRole
        ? activeRaterRole
        : canOfficialRateSchoolOrVenue
          ? "official"
          : null;

    if (!currentRaterRole) {
      setRatingError("You do not have permission to submit this rating.");
      return;
    }

    if (currentRaterRole === "official" && !["school", "venue"].includes(target.targetType)) {
      setRatingError("Officials can only rate the school or venue.");
      return;
    }

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
          role: currentRaterRole
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

  async function handleSubmitEvaluation(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!isEvaluator) {
      return;
    }

    const parsedScore = Number(evaluationScore);
    if (!Number.isInteger(parsedScore) || parsedScore < 1 || parsedScore > 5) {
      setEvaluationError("Overall score must be a whole number from 1 to 5.");
      return;
    }

    setSavingEvaluation(true);
    setEvaluationError(null);
    try {
      await upsertGameEvaluation(
        {
          gameId: activeGame.id,
          overallScore: parsedScore,
          notes: evaluationNotes.trim() || undefined
        },
        {
          uid: activeUser.uid
        }
      );
      setModalMessage({
        title: "Evaluation Saved",
        message: "Your evaluation was saved successfully."
      });
      setShowEvaluationForm(false);
    } catch (error) {
      setEvaluationError(getReadableFirestoreError(error, FIRESTORE_DATABASE_ID));
    } finally {
      setSavingEvaluation(false);
    }
  }

  return (
    <main className="page">
      <header className="hero page-header">
        <div className="page-header-content">
          <div>
            <span className="hero-eyebrow">Game record</span>
            <h1>Game Details</h1>
            <p>
              {activeGame.schoolName} • {activeGame.sport} • {activeGame.level}
            </p>
          </div>
          <div className="hero-badges">
            <span className="hero-badge">{statusLabel}</span>
            {!isDirectAssignment ? (
              <span className="hero-badge">Bid Window: {bidWindowInfo.label}</span>
            ) : null}
          </div>
        </div>
      </header>

      <div className="details-top-actions">
        <Link to={backPath} className="button-secondary details-back-link">
          {backLabel}
        </Link>
        {canManageGame ? (
          <button
            type="button"
            className="button-danger"
            onClick={() => setDeleteConfirmOpen(true)}
            disabled={deletingGame}
          >
            Delete Game
          </button>
        ) : null}
      </div>

      {dataError ? <p className="error-text">{dataError}</p> : null}

      <section className="details-grid">
        <article className="details-card">
          <h3>Game Info</h3>
          <p className="meta-line">Date/Time: {formatGameDate(activeGame.dateISO)}</p>
          <p className="meta-line">Location: {activeGame.location}</p>
          <p className="meta-line">Posted pay: {formatCurrency(activeGame.payPosted)}</p>
          <p className="meta-line">Status: {statusLabel}</p>
          <p className="meta-line">
            Assigned by: {activeGame.createdByName ?? activeGame.createdByRole}
          </p>
          {!isDirectAssignment ? (
            <p className={`meta-line bid-window bid-window-${bidWindowInfo.state}`}>
              Bid window: <strong>{bidWindowInfo.label}</strong>
            </p>
          ) : null}
          {activeGame.notes ? <p className="meta-line">Notes: {activeGame.notes}</p> : null}
        </article>

        <article className="details-card">
          <h3>{shouldShowAssignmentSnapshot ? "Assignment Snapshot" : "Bidding Snapshot"}</h3>
          {shouldShowAssignmentSnapshot ? (
            <>
              <p className="meta-line">
                Assigned to:{" "}
                {isDirectAssignment
                  ? getDirectAssignmentDisplay(activeGame)
                  : selectedBid
                    ? getBidderLabel(selectedBid)
                    : "Not selected"}
              </p>
              <p className="meta-line">
                Total assigned officials: {assignedIndividuals.length}
              </p>
              <p className="meta-line">
                Awarded fee: {formatCurrency(awardedFee)}
              </p>
            </>
          ) : activeProfile.role === "official" || isEvaluator ? (
            <>
              <p className="meta-line">Total bids: {gameBids.length}</p>
              <p className="meta-line">
                Current price:{" "}
                {highestBid
                  ? formatCurrency(highestBid.amount)
                  : formatCurrency(activeGame.payPosted)}
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

      {activeGame.status === "awarded" ? (
        <section className="details-card">
          <h3>Assigned Individuals</h3>
          {assignedIndividuals.length === 0 ? (
            <p className="empty-text">No assigned individuals found.</p>
          ) : (
            <div className="schedule-table-wrapper">
              <table className="schedule-table">
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Position</th>
                    <th>Crew</th>
                  </tr>
                </thead>
                <tbody>
                  {assignedIndividuals.map((entry) => (
                    <tr key={`${entry.uid}-${entry.name}`}>
                      <td>{entry.name}</td>
                      <td>{entry.position}</td>
                      <td>{entry.crew}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      ) : null}

      {activeProfile.role === "official" && activeGame.status === "open" ? (
        <section className="details-card">
          <h3>Bid On This Game</h3>
          {placeBidDisabledReason ? (
            <p className="empty-text">{placeBidDisabledReason}</p>
          ) : (
            <>
              <div className="details-top-actions">
                <button
                  type="button"
                  onClick={() => setShowBidForm((current) => !current)}
                >
                  {showBidForm ? "Close Bid Form" : "Place / Update Bid"}
                </button>
              </div>
              {showBidForm ? (
                <BidForm
                  postedPay={activeGame.payPosted}
                  defaultOfficialName={activeProfile.displayName}
                  availableCrews={officialCrews}
                  existingBids={officialBidsForGame}
                  forceCrewOnly={requiresCrewBid}
                  onSubmit={handleBidFormSubmit}
                  onCancel={() => setShowBidForm(false)}
                />
              ) : null}
            </>
          )}
        </section>
      ) : null}

      {!isDirectAssignment && canManageGame && activeGame.status === "open" ? (
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
                        {isSelected || !canManageGame ? (
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
      ) : null}

      {isEvaluator ? (
        <section className="details-card">
          <h3>Game Evaluation</h3>
          <p className="meta-line">
            Submit a quick evaluation for this game assignment.
          </p>
          {myEvaluation ? (
            <p className="meta-line">
              Latest submission: {myEvaluation.overallScore}/5 on{" "}
              {formatGameDate(myEvaluation.updatedAtISO)}
            </p>
          ) : null}
          <div className="details-top-actions">
            <button
              type="button"
              onClick={() => {
                setShowEvaluationForm((current) => !current);
                setEvaluationError(null);
              }}
            >
              {showEvaluationForm
                ? "Close Evaluation Form"
                : myEvaluation
                  ? "Update Evaluation"
                  : "Add Evaluation"}
            </button>
          </div>

          {showEvaluationForm ? (
            <form className="bid-form" onSubmit={handleSubmitEvaluation}>
              <label>
                Overall Score
                <Select
                  value={evaluationScore}
                  disabled={savingEvaluation}
                  onValueChange={setEvaluationScore}
                  options={[
                    { value: "5", label: "5 - Excellent" },
                    { value: "4", label: "4 - Strong" },
                    { value: "3", label: "3 - Meets expectations" },
                    { value: "2", label: "2 - Needs improvement" },
                    { value: "1", label: "1 - Poor" }
                  ]}
                />
              </label>

              <label>
                Notes (Optional)
                <textarea
                  rows={4}
                  maxLength={600}
                  value={evaluationNotes}
                  onChange={(event) => setEvaluationNotes(event.target.value)}
                  disabled={savingEvaluation}
                  placeholder="General notes about game management, professionalism, and organization."
                />
              </label>

              {evaluationError ? <p className="error-text">{evaluationError}</p> : null}

              <div className="bid-form-actions">
                <button type="submit" disabled={savingEvaluation}>
                  {savingEvaluation ? "Saving..." : "Save Evaluation"}
                </button>
                <button
                  type="button"
                  className="button-secondary"
                  onClick={() => {
                    if (!savingEvaluation) {
                      setShowEvaluationForm(false);
                      setEvaluationError(null);
                    }
                  }}
                  disabled={savingEvaluation}
                >
                  Cancel
                </button>
              </div>
            </form>
          ) : null}
        </section>
      ) : null}

      {!isEvaluator ? (
        <section className="details-card">
          <h3>Post-Game Ratings</h3>
          {!canSubmitRatings ? (
            <p className="empty-text">You can rate this game after you are assigned and it is played.</p>
          ) : !gameHasBeenPlayed || activeGame.status !== "awarded" ? (
            <p className="empty-text">
              Ratings become available after game time and once the game is awarded.
            </p>
          ) : canOfficialRateSchoolOrVenue && officialSchoolVenueTargets.length === 0 ? (
            <p className="empty-text">No school or venue found for rating.</p>
          ) : canManageGame && ratingTargets.length === 0 ? (
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
                  {ratingTargets.map((target) => {
                    const targetKey = toTargetKey(target.targetType, target.targetId);
                    const existingRating = myRatingsByTargetKey.get(targetKey) ?? null;
                    const isEditing = editingRatingKey === targetKey;

                    return (
                      <Fragment key={targetKey}>
                        <tr>
                          <td>{target.targetName}</td>
                          <td>{getRatingTargetTypeLabel(target.targetType)}</td>
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
                                  <Select
                                    value={ratingStars}
                                    disabled={savingRating}
                                    onValueChange={setRatingStars}
                                    options={[
                                      { value: "5", label: "5" },
                                      { value: "4", label: "4" },
                                      { value: "3", label: "3" },
                                      { value: "2", label: "2" },
                                      { value: "1", label: "1" }
                                    ]}
                                  />
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
      ) : null}

      {modalMessage ? (
        <MessageModal
          title={modalMessage.title}
          message={modalMessage.message}
          onClose={() => setModalMessage(null)}
        />
      ) : null}

      {deleteConfirmOpen && canManageGame ? (
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

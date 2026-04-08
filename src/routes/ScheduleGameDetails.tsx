import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Building2, CheckCircle2, MapPinned, Shield, Star, Users, X } from "lucide-react";
import * as Dialog from "@radix-ui/react-dialog";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import { AuthPanel } from "../components/AuthPanel";
import { BidForm } from "../components/BidForm";
import { CompleteProfilePanel } from "../components/CompleteProfilePanel";
import { MessageModal } from "../components/MessageModal";
import { Button } from "../components/ui/Button";
import { Select } from "../components/ui/Select";
import { useAuth } from "../context/AuthContext";
import {
  findActiveBid,
  getBidEligibleCrewsForGame,
  getCrewBidCapacityError,
  getCrewBidUnavailableReason,
  getBidEligibleCrews,
  getCrewMemberCrews,
  isBidEditableByOfficial,
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
  deleteBid,
  deleteGame,
  listBids,
  selectBid,
  subscribeBids,
  subscribeCrews,
  subscribeEvaluationsForGame,
  subscribeGames,
  subscribeOfficialProfiles,
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
  RatingTargetType,
  SchoolExperienceRating,
  UserProfile
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
  positionCode?: FootballPosition;
}

type SchoolExperienceAnswer = "" | "yes" | "no";
type SchoolExperienceFormState = Record<keyof SchoolExperienceRating, SchoolExperienceAnswer>;

const SCHOOL_EXPERIENCE_QUESTIONS: Array<{
  field: keyof SchoolExperienceRating;
  label: string;
}> = [
  { field: "greetedOnArrival", label: "Did someone greet you upon arrival?" },
  { field: "satisfactoryLockerRoom", label: "Satisfactory locker room?" },
  { field: "towelsProvided", label: "Towels provided?" },
  { field: "foodDrinkProvided", label: "Food/Drink provided?" }
];

const STAR_OPTIONS = [
  { value: "5", label: "Excellent" },
  { value: "4", label: "Strong" },
  { value: "3", label: "Solid" },
  { value: "2", label: "Needs work" },
  { value: "1", label: "Poor" }
] as const;

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

function getRatingTargetPrompt(targetType: RatingTargetType): string {
  if (targetType === "school") {
    return "Capture the overall school-host experience for this assignment.";
  }
  if (targetType === "venue") {
    return "Document how the venue setup and environment felt on game day.";
  }
  if (targetType === "crew") {
    return "Rate how this crew performed and communicated during the assignment.";
  }
  return "Rate this official's professionalism, communication, and presence.";
}

function getRatingTargetIcon(targetType: RatingTargetType) {
  if (targetType === "crew") {
    return Users;
  }
  if (targetType === "school") {
    return Building2;
  }
  if (targetType === "venue") {
    return MapPinned;
  }
  return Shield;
}

function renderStarSummary(stars?: number | null): string {
  if (!stars) {
    return "Not rated yet";
  }

  return `${stars}/5 stars`;
}

const EMPTY_SCHOOL_EXPERIENCE_FORM: SchoolExperienceFormState = {
  greetedOnArrival: "",
  satisfactoryLockerRoom: "",
  towelsProvided: "",
  foodDrinkProvided: ""
};

function toSchoolExperienceFormState(
  schoolExperience?: SchoolExperienceRating
): SchoolExperienceFormState {
  if (!schoolExperience) {
    return { ...EMPTY_SCHOOL_EXPERIENCE_FORM };
  }

  return {
    greetedOnArrival: schoolExperience.greetedOnArrival ? "yes" : "no",
    satisfactoryLockerRoom: schoolExperience.satisfactoryLockerRoom ? "yes" : "no",
    towelsProvided: schoolExperience.towelsProvided ? "yes" : "no",
    foodDrinkProvided: schoolExperience.foodDrinkProvided ? "yes" : "no"
  };
}

function toSchoolExperiencePayload(
  schoolExperienceForm: SchoolExperienceFormState
): SchoolExperienceRating | null {
  const answers = Object.values(schoolExperienceForm);
  if (answers.some((answer) => answer === "")) {
    return null;
  }

  return {
    greetedOnArrival: schoolExperienceForm.greetedOnArrival === "yes",
    satisfactoryLockerRoom: schoolExperienceForm.satisfactoryLockerRoom === "yes",
    towelsProvided: schoolExperienceForm.towelsProvided === "yes",
    foodDrinkProvided: schoolExperienceForm.foodDrinkProvided === "yes"
  };
}

export function ScheduleGameDetails() {
  const { gameId } = useParams<{ gameId: string }>();
  const location = useLocation();
  const navigate = useNavigate();
  const { user, profile, loading, profileLoading } = useAuth();

  const [games, setGames] = useState<Game[]>([]);
  const [bids, setBids] = useState<Bid[]>([]);
  const [crews, setCrews] = useState<Crew[]>([]);
  const [officialProfiles, setOfficialProfiles] = useState<UserProfile[]>([]);
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
  const [schoolExperienceForm, setSchoolExperienceForm] = useState<SchoolExperienceFormState>({
    ...EMPTY_SCHOOL_EXPERIENCE_FORM
  });
  const [ratingError, setRatingError] = useState<string | null>(null);
  const [savingRating, setSavingRating] = useState(false);
  const [evaluationScore, setEvaluationScore] = useState("3");
  const [evaluationNotes, setEvaluationNotes] = useState("");
  const [evaluationError, setEvaluationError] = useState<string | null>(null);
  const [savingEvaluation, setSavingEvaluation] = useState(false);
  const [modalMessage, setModalMessage] = useState<{
    title: string;
    message: string;
    autoCloseMs?: number;
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
      setOfficialProfiles([]);
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
    const unsubscribeOfficialProfiles = subscribeOfficialProfiles(setOfficialProfiles, (error) =>
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
      unsubscribeOfficialProfiles();
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
    selectedBid?.bidderType === "crew" && (selectedBid.baseCrewId ?? selectedBid.crewId)
      ? crews.find((crew) => crew.id === (selectedBid.baseCrewId ?? selectedBid.crewId)) ?? null
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
  const gameEligibleCrews = useMemo(
    () => getBidEligibleCrewsForGame(officialCrews, game?.requestedCrewSize),
    [game?.requestedCrewSize, officialCrews]
  );

  const officialBidsForGame = useMemo(() => {
    if (!user || profile?.role !== "official") {
      return [];
    }
    return gameBids.filter((bid) =>
      isBidEditableByOfficial(
        bid,
        user.uid,
        officialCrews.map((crew) => crew.id)
      )
    );
  }, [gameBids, officialCrews, profile?.role, user]);

  const assignedIndividuals = useMemo<AssignedIndividual[]>(() => {
    if (!game || game.status !== "awarded") {
      return [];
    }

    if (game.assignedOfficials?.length) {
      return [...game.assignedOfficials]
        .map((official) => ({
          uid: official.officialUid,
          name: official.officialName,
          crew: game.awardedCrewId ? selectedBid?.crewName ?? "Crew" : "Individual",
          position: toPositionLabel(official.role),
          positionCode: official.role
        }))
        .sort((a, b) => a.name.localeCompare(b.name));
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
            position: toPositionLabel(assignment.position),
            positionCode: assignment.position
          });
          return;
        }

        const assignmentCrew = crews.find((crew) => crew.id === assignment.crewId) ?? null;
        assignment.memberUids.forEach((memberUid, index) => {
          addAssignedIndividual({
            uid: memberUid,
            name: assignment.memberNames[index] ?? "Official",
            crew: assignment.crewName,
            position: toPositionLabel(assignmentCrew?.memberPositions?.[memberUid]),
            positionCode: assignmentCrew?.memberPositions?.[memberUid]
          });
        });
      });

      return Array.from(assignedByKey.values()).sort((a, b) => a.name.localeCompare(b.name));
    }

    if (!selectedBid) {
      return [];
    }

    if (selectedBid.bidderType === "crew" && selectedBid.proposedRoster?.length) {
      selectedBid.proposedRoster.forEach((official) => {
        addAssignedIndividual({
          uid: official.officialUid,
          name: official.officialName,
          crew: selectedBid.crewName ?? "Crew",
          position: toPositionLabel(official.role),
          positionCode: official.role
        });
      });

      return Array.from(assignedByKey.values()).sort((a, b) => a.name.localeCompare(b.name));
    }

    if (selectedBid.bidderType === "crew" && (selectedBid.baseCrewId ?? selectedBid.crewId)) {
      if (selectedBidCrew) {
        selectedBidCrew.members.forEach((member) => {
          addAssignedIndividual({
            uid: member.uid,
            name: member.name,
            crew: selectedBid.crewName ?? selectedBidCrew.name,
            position: toPositionLabel(selectedBidCrew.memberPositions[member.uid]),
            positionCode: selectedBidCrew.memberPositions[member.uid]
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

    if (selectedBid.bidderType === "crew" && (selectedBid.baseCrewId ?? selectedBid.crewId)) {
      addTarget({
        targetType: "crew",
        targetId: selectedBid.baseCrewId ?? selectedBid.crewId ?? "",
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

  useEffect(() => {
    if (!editingRatingKey) {
      return;
    }

    const activeTargetStillVisible = rateableTargets.some(
      (target) => toTargetKey(target.targetType, target.targetId) === editingRatingKey
    );
    const officialTargetStillVisible = officialSchoolVenueTargets.some(
      (target) => toTargetKey(target.targetType, target.targetId) === editingRatingKey
    );

    if (!activeTargetStillVisible && !officialTargetStillVisible) {
      setEditingRatingKey(null);
      setRatingError(null);
    }
  }, [editingRatingKey, officialSchoolVenueTargets, rateableTargets]);

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
  const assignedOfficialEntry =
    activeProfile.role === "official"
      ? assignedIndividuals.find((entry) => entry.uid === activeUser.uid) ?? null
      : null;
  const isAssignedReferee = assignedOfficialEntry?.positionCode === "R";
  const canViewAwardedDetails =
    activeGame.status !== "awarded" || canManageGame || isAssignedOfficial || isEvaluator;
  const shouldShowAssignmentSnapshot = isDirectAssignment || activeGame.status === "awarded";
  const awardedFee = isDirectAssignment
    ? activeGame.payPosted
    : selectedBid
      ? selectedBid.amount
      : activeGame.payPosted;
  const gameHasBeenPlayed = new Date(activeGame.dateISO).getTime() <= nowMs;
  const managerRatingTargets = rateableTargets.filter((target) => target.targetType === "crew");
  const evaluatorRatingTargets = rateableTargets.filter(
    (target) => target.targetType === "crew" || target.targetType === "official"
  );
  const canOfficialRateSchoolOrVenue =
    activeProfile.role === "official" &&
    isAssignedOfficial &&
    gameHasBeenPlayed &&
    activeGame.status === "awarded";
  const canEvaluatorRate = isEvaluator && gameHasBeenPlayed && activeGame.status === "awarded";
  const canSubmitRatings = canManageGame || canOfficialRateSchoolOrVenue || canEvaluatorRate;
  const ratingTargets = canManageGame
    ? managerRatingTargets
    : canEvaluatorRate
      ? evaluatorRatingTargets
    : officialSchoolVenueTargets.filter(
        (target) => target.targetType !== "school" || isAssignedReferee
      );
  const activeRatingTarget =
    ratingTargets.find((target) => toTargetKey(target.targetType, target.targetId) === editingRatingKey) ??
    null;
  const completedRatingsCount = ratingTargets.filter((target) =>
    myRatingsByTargetKey.has(toTargetKey(target.targetType, target.targetId))
  ).length;
  const remainingRatingsCount = Math.max(ratingTargets.length - completedRatingsCount, 0);
  const nextRatingTarget =
    ratingTargets.find(
      (target) => !myRatingsByTargetKey.has(toTargetKey(target.targetType, target.targetId))
    ) ??
    ratingTargets[0] ??
    null;
  const ratingIntroCopy = canManageGame
    ? "Launch the rating studio to rate the crew as one unit after the game."
    : canEvaluatorRate
      ? "Use the rating studio to rate the crew overall and, when needed, the assigned officials."
    : isAssignedReferee
      ? "Use the rating studio to capture both the school-host experience and the venue details."
      : "Use the rating studio to capture your school and venue experience after the game.";
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
            : requiresCrewBid && gameEligibleCrews.length === 0
              ? getCrewBidUnavailableReason({
                  requestedCrewSize: activeGame.requestedCrewSize,
                  eligibleCrewCount: officialCrews.length,
                  eligibleCrewCountForGame: gameEligibleCrews.length,
                  memberCrewCount: memberCrews.length,
                  requiresCrewBid: true
                })
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
        message: "The bid was selected successfully.",
        autoCloseMs: 1800
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
    baseCrewId?: string;
    crewName?: string;
    proposedRoster?: Bid["proposedRoster"];
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
        ? gameEligibleCrews.find((crew) => crew.id === input.crewId) ?? null
        : null;

    if (input.bidderType === "crew" && !selectedCrew) {
      throw new Error("Only the Referee for this crew can place a crew bid.");
    }

    const crewCapacityError = getCrewBidCapacityError({
      bidderType: input.bidderType,
      selectedCrew,
      proposedRoster: input.proposedRoster,
      requestedCrewSize: activeGame.requestedCrewSize
    });
    if (crewCapacityError) {
      throw new Error(crewCapacityError);
    }

    const latestIdentityBid = findActiveBid({
      bidderType: input.bidderType,
      existingBids: gameBids.filter((bid) =>
        isBidEditableByOfficial(
          bid,
          activeUser.uid,
          officialCrews.map((crew) => crew.id)
        )
      ),
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
        baseCrewId: selectedCrew?.id,
        crewName: selectedCrew?.name,
        proposedRoster: input.proposedRoster,
        amount: input.amount,
        message: input.message
      });
      setBids(await listBids());
      setModalMessage({
        title: "Offer Increased",
        message: "Your bid was updated successfully.",
        autoCloseMs: 1800
      });
      return;
    }

    await createBid({
      gameId: activeGame.id,
      officialUid: activeUser.uid,
      officialName: input.officialName,
      bidderType: input.bidderType,
      crewId: selectedCrew?.id,
      baseCrewId: selectedCrew?.id,
      crewName: selectedCrew?.name,
      proposedRoster: input.proposedRoster,
      amount: input.amount,
      message: input.message
    });
    setBids(await listBids());
    setModalMessage({
      title: "Bid Submitted",
      message: "Your bid was submitted successfully.",
      autoCloseMs: 1800
    });
  }

  async function handleBidFormSubmit(input: {
    officialName: string;
    bidderType: "individual" | "crew";
    crewId?: string;
    baseCrewId?: string;
    crewName?: string;
    proposedRoster?: Bid["proposedRoster"];
    amount: number;
    message?: string;
  }) {
    await handleSubmitBid(input);
    setShowBidForm(false);
  }

  async function handleDeleteOfficialBid(bidId: string) {
    setBusyBidId(bidId);
    try {
      await deleteBid(bidId);
      setBids(await listBids());
    } finally {
      setBusyBidId(null);
    }
  }

  function beginRating(target: RateableTarget) {
    const key = toTargetKey(target.targetType, target.targetId);
    const existing = myRatingsByTargetKey.get(key);
    setEditingRatingKey(key);
    setRatingStars(existing ? String(existing.stars) : "5");
    setRatingComment(existing?.comment ?? "");
    setSchoolExperienceForm(toSchoolExperienceFormState(existing?.schoolExperience));
    setRatingError(null);
  }

  function closeRatingStudio() {
    if (savingRating) {
      return;
    }

    setEditingRatingKey(null);
    setRatingError(null);
  }

  async function handleSaveRating(target: RateableTarget) {
    const currentRaterRole: "assignor" | "school" | "official" | "evaluator" | null =
      canManageGame && activeRaterRole
        ? activeRaterRole
        : canOfficialRateSchoolOrVenue
          ? "official"
          : canEvaluatorRate
            ? "evaluator"
          : null;

    if (!currentRaterRole) {
      setRatingError("You do not have permission to submit this rating.");
      return;
    }

    if (currentRaterRole === "official" && !["school", "venue"].includes(target.targetType)) {
      setRatingError("Officials can only rate the school or venue.");
      return;
    }

    if ((currentRaterRole === "assignor" || currentRaterRole === "school") && target.targetType !== "crew") {
      setRatingError("Schools and assignors can only rate crews.");
      return;
    }

    if (currentRaterRole === "evaluator" && !["crew", "official"].includes(target.targetType)) {
      setRatingError("Evaluators can only rate crews or officials.");
      return;
    }

    const requiresSchoolExperience =
      currentRaterRole === "official" && target.targetType === "school" && isAssignedReferee;
    if (currentRaterRole === "official" && target.targetType === "school" && !isAssignedReferee) {
      setRatingError("Only the assigned Referee can submit a school experience rating.");
      return;
    }

    const parsedStars = Number(ratingStars);
    if (!Number.isInteger(parsedStars) || parsedStars < 1 || parsedStars > 5) {
      setRatingError("Rating must be a whole number from 1 to 5.");
      return;
    }

    const schoolExperience = requiresSchoolExperience
      ? toSchoolExperiencePayload(schoolExperienceForm)
      : undefined;
    if (requiresSchoolExperience && !schoolExperience) {
      setRatingError("Answer each school experience question before saving.");
      return;
    }

    setSavingRating(true);
    setRatingError(null);
    try {
      const ratingInput: {
        gameId: string;
        targetType: RatingTargetType;
        targetId: string;
        stars: number;
        comment?: string;
        schoolExperience?: SchoolExperienceRating;
      } = {
        gameId: activeGame.id,
        targetType: target.targetType,
        targetId: target.targetId,
        stars: parsedStars,
        comment: ratingComment.trim() || undefined
      };

      if (schoolExperience) {
        ratingInput.schoolExperience = schoolExperience;
      }

      await upsertGameRating(
        ratingInput,
        {
          uid: activeUser.uid,
          role: currentRaterRole
        }
      );

      const nowISO = new Date().toISOString();
      setRatings((current) => {
        const optimisticId = `${activeGame.id}__${activeUser.uid}__${target.targetType}__${target.targetId}`;
        const nextRating: Rating = {
          id: optimisticId,
          gameId: activeGame.id,
          targetType: target.targetType,
          targetId: target.targetId,
          ratedByUid: activeUser.uid,
          ratedByRole: currentRaterRole,
          stars: parsedStars,
          comment: ratingInput.comment,
          schoolExperience: ratingInput.schoolExperience,
          createdAtISO:
            current.find(
              (rating) =>
                rating.gameId === activeGame.id &&
                rating.targetType === target.targetType &&
                rating.targetId === target.targetId &&
                rating.ratedByUid === activeUser.uid
            )?.createdAtISO ?? nowISO,
          updatedAtISO: nowISO
        };

        const nextRatings = current.filter(
          (rating) =>
            !(
              rating.gameId === activeGame.id &&
              rating.targetType === target.targetType &&
              rating.targetId === target.targetId &&
              rating.ratedByUid === activeUser.uid
            )
        );

        return [...nextRatings, nextRating];
      });

      setModalMessage({
        title: "Rating Saved",
        message: `Saved ${parsedStars}/5 for ${target.targetName}.`,
        autoCloseMs: 1800
      });
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
        message: "Your evaluation was saved successfully.",
        autoCloseMs: 1800
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
          {activeGame.requestedCrewSize ? (
            <p className="meta-line">Crew of {activeGame.requestedCrewSize}</p>
          ) : null}
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
                  sport={activeGame.sport}
                  requestedCrewSize={activeGame.requestedCrewSize}
                  availableCrews={gameEligibleCrews}
                  availableOfficials={officialProfiles}
                  existingBids={officialBidsForGame}
                  forceCrewOnly={requiresCrewBid}
                  onSubmit={handleBidFormSubmit}
                  onCancel={() => setShowBidForm(false)}
                />
              ) : null}
              <section className="bids-section">
                <h4>Your bids on this game</h4>
                {officialBidsForGame.length === 0 ? (
                  <p className="empty-text">No bids yet.</p>
                ) : (
                  <ul className="bid-list">
                    {officialBidsForGame.map((bid) => {
                      const canDeleteBid = isBidEditableByOfficial(
                        bid,
                        activeUser.uid,
                        officialCrews.map((crew) => crew.id)
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
                          {bid.message ? (
                            <div className="meta-line">Message: {bid.message}</div>
                          ) : null}

                          {canDeleteBid ? (
                            <button
                              type="button"
                              className="button-link-danger"
                              onClick={() => handleDeleteOfficialBid(bid.id)}
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

      <section className="details-card">
          <div className="rating-hub-header">
            <div className="rating-hub-copy">
              <span className="rating-hub-eyebrow">After the final whistle</span>
              <h3>Post-Game Ratings</h3>
              <p className="meta-line">{ratingIntroCopy}</p>
            </div>
            {canSubmitRatings && gameHasBeenPlayed && activeGame.status === "awarded" ? (
              <Button
                type="button"
                variant="secondary"
                onClick={() => {
                  if (nextRatingTarget) {
                    beginRating(nextRatingTarget);
                  }
                }}
                disabled={!nextRatingTarget}
              >
                {completedRatingsCount > 0 ? "Open Rating Studio" : "Start Rating"}
              </Button>
            ) : null}
          </div>
          {!canSubmitRatings ? (
            <p className="empty-text">You can rate this game after you are assigned and it is played.</p>
          ) : !gameHasBeenPlayed || activeGame.status !== "awarded" ? (
            <p className="empty-text">
              Ratings become available after game time and once the game is awarded.
            </p>
          ) : canOfficialRateSchoolOrVenue && officialSchoolVenueTargets.length === 0 ? (
            <p className="empty-text">No school or venue found for rating.</p>
          ) : canManageGame && ratingTargets.length === 0 ? (
            <p className="empty-text">No awarded crew found for rating.</p>
          ) : canEvaluatorRate && ratingTargets.length === 0 ? (
            <p className="empty-text">No crew or assigned officials found for rating.</p>
          ) : (
            <div className="rating-hub-shell">
              <div className="rating-hub-stats">
                <article className="rating-hub-stat">
                  <span className="rating-hub-stat-label">Available targets</span>
                  <strong className="rating-hub-stat-value">{ratingTargets.length}</strong>
                </article>
                <article className="rating-hub-stat">
                  <span className="rating-hub-stat-label">Completed by you</span>
                  <strong className="rating-hub-stat-value">{completedRatingsCount}</strong>
                </article>
                <article className="rating-hub-stat">
                  <span className="rating-hub-stat-label">Still open</span>
                  <strong className="rating-hub-stat-value">{remainingRatingsCount}</strong>
                </article>
              </div>

              <div className="rating-hub-target-grid">
                {ratingTargets.map((target) => {
                  const targetKey = toTargetKey(target.targetType, target.targetId);
                  const existingRating = myRatingsByTargetKey.get(targetKey) ?? null;
                  const TargetIcon = getRatingTargetIcon(target.targetType);

                  return (
                    <button
                      key={targetKey}
                      type="button"
                      className="rating-target-card"
                      onClick={() => beginRating(target)}
                      disabled={savingRating}
                    >
                      <div className="rating-target-card-top">
                        <span className="rating-target-card-icon" aria-hidden="true">
                          <TargetIcon />
                        </span>
                        <span className="rating-target-card-type">
                          {getRatingTargetTypeLabel(target.targetType)}
                        </span>
                        <span
                          className={
                            existingRating
                              ? "rating-target-card-status rating-target-card-status-complete"
                              : "rating-target-card-status"
                          }
                        >
                          {existingRating ? "Saved" : "Needs rating"}
                        </span>
                      </div>
                      <strong>{target.targetName}</strong>
                      <p>{target.detail}</p>
                      <div className="rating-target-card-footer">
                        <span className="rating-target-card-stars">
                          <Star aria-hidden="true" />
                          {renderStarSummary(existingRating?.stars)}
                        </span>
                        {existingRating ? (
                          <span>{formatGameDate(existingRating.updatedAtISO)}</span>
                        ) : (
                          <span>Open studio</span>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
      </section>

      {activeRatingTarget ? (
        <Dialog.Root open onOpenChange={(open) => (!open ? closeRatingStudio() : undefined)}>
          <Dialog.Portal>
            <Dialog.Overlay className="rating-studio-overlay" />
            <Dialog.Content className="rating-studio-dialog">
              <div className="rating-studio-shell">
                <aside className="rating-studio-sidebar">
                  <div className="rating-studio-sidebar-header">
                    <span className="rating-hub-eyebrow">Rating Studio</span>
                    <Dialog.Title className="rating-studio-title">
                      Post-Game Ratings
                    </Dialog.Title>
                    <Dialog.Description className="rating-studio-description">
                      Select a target, review your existing score, and save feedback in one focused
                      place.
                    </Dialog.Description>
                  </div>

                  <div className="rating-studio-progress">
                    <div>
                      <span className="rating-hub-stat-label">Completed</span>
                      <strong className="rating-hub-stat-value">{completedRatingsCount}</strong>
                    </div>
                    <div>
                      <span className="rating-hub-stat-label">Remaining</span>
                      <strong className="rating-hub-stat-value">{remainingRatingsCount}</strong>
                    </div>
                  </div>

                  <div className="rating-studio-target-list" role="list" aria-label="Rating targets">
                    {ratingTargets.map((target) => {
                      const targetKey = toTargetKey(target.targetType, target.targetId);
                      const existingRating = myRatingsByTargetKey.get(targetKey) ?? null;
                      const TargetIcon = getRatingTargetIcon(target.targetType);
                      const isActive = targetKey === editingRatingKey;

                      return (
                        <button
                          key={targetKey}
                          type="button"
                          className={
                            isActive
                              ? "rating-studio-target rating-studio-target-active"
                              : "rating-studio-target"
                          }
                          onClick={() => beginRating(target)}
                          disabled={savingRating}
                          aria-pressed={isActive}
                        >
                          <span className="rating-studio-target-icon" aria-hidden="true">
                            <TargetIcon />
                          </span>
                          <span className="rating-studio-target-copy">
                            <strong>{target.targetName}</strong>
                            <span>{target.detail}</span>
                          </span>
                          <span className="rating-studio-target-meta">
                            {existingRating ? `${existingRating.stars}/5` : "New"}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </aside>

                <section className="rating-studio-editor">
                  <div className="rating-studio-editor-head">
                    <div>
                      <span className="rating-studio-type-pill">
                        {getRatingTargetTypeLabel(activeRatingTarget.targetType)}
                      </span>
                      <h4>{activeRatingTarget.targetName}</h4>
                      <p>{getRatingTargetPrompt(activeRatingTarget.targetType)}</p>
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="rating-studio-close"
                      onClick={closeRatingStudio}
                      disabled={savingRating}
                      aria-label="Close rating studio"
                    >
                      <X />
                    </Button>
                  </div>

                  <div className="rating-studio-current">
                    <div>
                      <span className="rating-hub-stat-label">Current rating</span>
                      <strong className="rating-hub-stat-value">
                        {renderStarSummary(
                          myRatingsByTargetKey.get(
                            toTargetKey(activeRatingTarget.targetType, activeRatingTarget.targetId)
                          )?.stars
                        )}
                      </strong>
                    </div>
                    <div>
                      <span className="rating-hub-stat-label">Details</span>
                      <strong className="rating-studio-current-detail">
                        {activeRatingTarget.detail}
                      </strong>
                    </div>
                  </div>

                  {activeProfile.role === "official" &&
                  activeRatingTarget.targetType === "school" &&
                  isAssignedReferee ? (
                    <div className="rating-question-grid">
                      {SCHOOL_EXPERIENCE_QUESTIONS.map((question) => (
                        <div key={question.field} className="rating-question-card">
                          <span className="rating-question-label">{question.label}</span>
                          <div className="rating-choice-group" role="group" aria-label={question.label}>
                            {(["yes", "no"] as const).map((answer) => {
                              const isActive = schoolExperienceForm[question.field] === answer;

                              return (
                                <button
                                  key={answer}
                                  type="button"
                                  className={
                                    isActive
                                      ? "rating-choice-button rating-choice-button-active"
                                      : "rating-choice-button"
                                  }
                                  onClick={() =>
                                    setSchoolExperienceForm((current) => ({
                                      ...current,
                                      [question.field]: answer
                                    }))
                                  }
                                  disabled={savingRating}
                                  aria-pressed={isActive}
                                >
                                  {answer === "yes" ? "Yes" : "No"}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : null}

                  <div className="rating-stars-panel">
                    <span className="rating-question-label">
                      {activeProfile.role === "official" &&
                      activeRatingTarget.targetType === "school" &&
                      isAssignedReferee
                        ? "Overall school experience"
                        : "Overall rating"}
                    </span>
                    <div className="rating-stars-grid" role="group" aria-label="Overall rating">
                      {STAR_OPTIONS.map((option) => {
                        const isActive = ratingStars === option.value;

                        return (
                          <button
                            key={option.value}
                            type="button"
                            className={
                              isActive
                                ? "rating-star-button rating-star-button-active"
                                : "rating-star-button"
                            }
                            onClick={() => setRatingStars(option.value)}
                            disabled={savingRating}
                            aria-pressed={isActive}
                            aria-label={`${option.value} star${option.value === "1" ? "" : "s"}`}
                          >
                            <span className="rating-star-button-value">
                              <Star aria-hidden="true" />
                              {option.value}
                            </span>
                            <span className="rating-star-button-label">{option.label}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <label className="rating-comment-field">
                    {activeProfile.role === "official" &&
                    activeRatingTarget.targetType === "school" &&
                    isAssignedReferee
                      ? "Comments"
                      : "Comment (Optional)"}
                    <textarea
                      rows={4}
                      maxLength={200}
                      value={ratingComment}
                      onChange={(event) => setRatingComment(event.target.value)}
                      disabled={savingRating}
                      placeholder="Add context that would help on future assignments."
                    />
                  </label>

                  {ratingError ? <p className="error-text">{ratingError}</p> : null}

                  <div className="rating-studio-actions">
                    <Button
                      type="button"
                      onClick={() => handleSaveRating(activeRatingTarget)}
                      disabled={savingRating}
                    >
                      {savingRating ? "Saving..." : "Save Rating"}
                    </Button>
                    <Button
                      type="button"
                      variant="secondary"
                      onClick={closeRatingStudio}
                      disabled={savingRating}
                    >
                      Close
                    </Button>
                  </div>

                  {completedRatingsCount === ratingTargets.length && ratingTargets.length > 0 ? (
                    <div className="rating-studio-success">
                      <CheckCircle2 aria-hidden="true" />
                      <span>All available targets for this game have been rated.</span>
                    </div>
                  ) : null}
                </section>
              </div>
            </Dialog.Content>
          </Dialog.Portal>
        </Dialog.Root>
      ) : null}

      {modalMessage ? (
        <MessageModal
          title={modalMessage.title}
          message={modalMessage.message}
          autoCloseMs={modalMessage.autoCloseMs}
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

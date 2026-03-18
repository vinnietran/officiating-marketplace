import { useEffect, useMemo, useState } from "react";
import { AuthPanel } from "../components/AuthPanel";
import { CompleteProfilePanel } from "../components/CompleteProfilePanel";
import { MessageModal } from "../components/MessageModal";
import { PageHeader } from "../components/ui/PageHeader";
import { Select } from "../components/ui/Select";
import { useAuth } from "../context/AuthContext";
import { getCrewRefereeOfficialId } from "../lib/bids";
import { FIRESTORE_DATABASE_ID } from "../lib/firebase";
import { getReadableFirestoreError } from "../lib/firebaseErrors";
import {
  createCrew,
  deleteCrew,
  searchOfficialProfilesByEmail,
  subscribeCrews,
  updateCrewChief,
  updateCrewMemberPositions,
  updateCrewMembers
} from "../lib/firestore";
import type { Crew, CrewMember, FootballPosition, UserProfile } from "../types";

const MAX_CREW_MEMBERS = 15;
const FOOTBALL_POSITION_OPTIONS: Array<{ code: FootballPosition; label: string }> = [
  { code: "R", label: "Referee (R)" },
  { code: "U", label: "Umpire (U)" },
  { code: "C", label: "Center Judge (C)" },
  { code: "H", label: "Head Line Judge (H)" },
  { code: "L", label: "Line Judge (L)" },
  { code: "S", label: "Side Judge (S)" },
  { code: "F", label: "Field Judge (F)" },
  { code: "B", label: "Back Judge (B)" },
  { code: "RO", label: "Replay Official (RO)" },
  { code: "RC", label: "Replay Communicator (RC)" },
  { code: "ALT", label: "Alternate (ALT)" }
];

function normalizeMemberPositions(
  memberUids: string[],
  positionsByUid: Record<string, FootballPosition | "">
): Partial<Record<string, FootballPosition>> {
  const memberUidSet = new Set(memberUids);
  const allowedCodes = new Set(FOOTBALL_POSITION_OPTIONS.map((option) => option.code));
  const normalized: Partial<Record<string, FootballPosition>> = {};

  Object.entries(positionsByUid).forEach(([uid, value]) => {
    if (!memberUidSet.has(uid)) {
      return;
    }

    if (!value || !allowedCodes.has(value as FootballPosition)) {
      return;
    }

    normalized[uid] = value as FootballPosition;
  });

  return normalized;
}

function byName(a: CrewMember, b: CrewMember) {
  return a.name.localeCompare(b.name);
}

function formatCreatedAt(dateISO: string): string {
  const date = new Date(dateISO);
  if (Number.isNaN(date.getTime())) {
    return "Unknown";
  }

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric"
  }).format(date);
}

function getCrewChiefUid(crew: Crew): string {
  return crew.crewChiefUid?.trim() ? crew.crewChiefUid : crew.createdByUid;
}

function getCrewChiefName(crew: Crew): string {
  return crew.crewChiefName?.trim() ? crew.crewChiefName : crew.createdByName;
}

function getAssignedRefereeCount(
  positionsByUid: Partial<Record<string, FootballPosition>>
): number {
  return Object.values(positionsByUid).filter((position) => position === "R").length;
}

function getCrewRefereeName(crew: Crew): string {
  const refereeOfficialId = getCrewRefereeOfficialId(crew);
  if (!refereeOfficialId) {
    return "Unassigned";
  }

  return (
    crew.members.find((member) => member.uid === refereeOfficialId)?.name ??
    (crew.createdByUid === refereeOfficialId ? crew.createdByName : "Assigned")
  );
}

export function Crews() {
  const { user, profile, loading, profileLoading } = useAuth();

  const [crews, setCrews] = useState<Crew[]>([]);
  const [dataError, setDataError] = useState<string | null>(null);
  const [crewName, setCrewName] = useState("");
  const [inviteEmail, setInviteEmail] = useState("");
  const [matchedOfficials, setMatchedOfficials] = useState<UserProfile[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchResultMessage, setSearchResultMessage] = useState<string | null>(null);
  const [selectedMembers, setSelectedMembers] = useState<CrewMember[]>([]);
  const [selectedMemberPositions, setSelectedMemberPositions] = useState<
    Record<string, FootballPosition | "">
  >({});
  const [selectedCrewId, setSelectedCrewId] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [deleteCrewId, setDeleteCrewId] = useState<string | null>(null);
  const [deletingCrew, setDeletingCrew] = useState(false);
  const [manageInviteEmail, setManageInviteEmail] = useState("");
  const [manageMatchedOfficials, setManageMatchedOfficials] = useState<UserProfile[]>([]);
  const [manageSearching, setManageSearching] = useState(false);
  const [manageResultMessage, setManageResultMessage] = useState<string | null>(null);
  const [updatingCrewMembers, setUpdatingCrewMembers] = useState(false);
  const [manageCrewChiefUid, setManageCrewChiefUid] = useState("");
  const [updatingCrewChief, setUpdatingCrewChief] = useState(false);
  const [manageMemberPositions, setManageMemberPositions] = useState<
    Record<string, FootballPosition | "">
  >({});
  const [updatingCrewPositions, setUpdatingCrewPositions] = useState(false);
  const [modalMessage, setModalMessage] = useState<{
    title: string;
    message: string;
    autoCloseMs?: number;
  } | null>(null);

  useEffect(() => {
    if (!user) {
      setCrews([]);
      return;
    }

    const unsubscribeCrews = subscribeCrews(setCrews, (error) =>
      setDataError(getReadableFirestoreError(error, FIRESTORE_DATABASE_ID))
    );

    return () => {
      unsubscribeCrews();
    };
  }, [user]);

  useEffect(() => {
    if (!profile || profile.role !== "official") {
      return;
    }

    setSelectedMembers((current) => {
      const hasCurrentUser = current.some((member) => member.uid === profile.uid);
      if (hasCurrentUser) {
        return current;
      }

      return [
        ...current,
        {
          uid: profile.uid,
          name: profile.displayName,
          email: profile.email
        }
      ].sort(byName);
    });

    setSelectedMemberPositions((current) => {
      if (current[profile.uid] !== undefined) {
        return current;
      }
      return {
        ...current,
        [profile.uid]: ""
      };
    });
  }, [profile]);

  const canAccessCrews =
    profile?.role === "official" ||
    profile?.role === "assignor" ||
    profile?.role === "school";

  const visibleCrews = useMemo(() => {
    if (!user || !profile) {
      return [];
    }

    if (profile.role === "official") {
      return crews.filter((crew) => crew.memberUids.includes(user.uid));
    }

    if (profile.role === "assignor" || profile.role === "school") {
      return crews.filter((crew) => crew.createdByUid === user.uid);
    }

    return [];
  }, [crews, profile, user]);

  const hasMaximumMembers = selectedMembers.length >= MAX_CREW_MEMBERS;
  const selectedCrew = useMemo(
    () => visibleCrews.find((crew) => crew.id === selectedCrewId) ?? null,
    [selectedCrewId, visibleCrews]
  );
  const chiefOptions = useMemo(() => {
    if (!selectedCrew) {
      return [];
    }

    const optionsByUid = new Map<string, string>();
    selectedCrew.members.forEach((member) => {
      optionsByUid.set(member.uid, member.name);
    });
    optionsByUid.set(selectedCrew.createdByUid, selectedCrew.createdByName);

    return Array.from(optionsByUid.entries())
      .map(([uid, name]) => ({ uid, name }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [selectedCrew]);
  useEffect(() => {
    if (!selectedCrewId) {
      setManageInviteEmail("");
      setManageMatchedOfficials([]);
      setManageResultMessage(null);
      setManageCrewChiefUid("");
      setManageMemberPositions({});
      return;
    }

    const exists = visibleCrews.some((crew) => crew.id === selectedCrewId);
    if (!exists) {
      setSelectedCrewId(null);
      setManageInviteEmail("");
      setManageMatchedOfficials([]);
      setManageResultMessage(null);
      setManageCrewChiefUid("");
      setManageMemberPositions({});
    }
  }, [selectedCrewId, visibleCrews]);

  useEffect(() => {
    if (!selectedCrew) {
      setManageCrewChiefUid("");
      setManageMemberPositions({});
      return;
    }
    setManageCrewChiefUid(getCrewChiefUid(selectedCrew));
    setManageMemberPositions(() => {
      const next: Record<string, FootballPosition | ""> = {};
      selectedCrew.memberUids.forEach((uid) => {
        next[uid] = selectedCrew.memberPositions[uid] ?? "";
      });
      return next;
    });
  }, [selectedCrew]);

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
          <h1>Crews</h1>
          <p>Sign in to create and manage crews.</p>
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
          <h1>Crews</h1>
        </header>
        <CompleteProfilePanel />
      </main>
    );
  }

  if (!canAccessCrews) {
    return (
      <main className="page">
        <header className="hero">
          <h1>Crews</h1>
          <p>Crews are available for officials, assignors, and schools.</p>
        </header>
      </main>
    );
  }

  const activeUser = user;
  const activeProfile = profile;
  const creatorRole: "official" | "assignor" | "school" =
    activeProfile.role === "official"
      ? "official"
      : activeProfile.role === "assignor"
        ? "assignor"
        : "school";
  const selectedCrewChiefUid = selectedCrew ? getCrewChiefUid(selectedCrew) : "";
  const selectedCrewChiefName = selectedCrew ? getCrewChiefName(selectedCrew) : "";
  const canAssignSelectedCrewPositions =
    Boolean(selectedCrew) && selectedCrewChiefUid === activeUser.uid;
  const hasManagePositionChanges = selectedCrew
    ? selectedCrew.memberUids.some((uid) => {
        const persisted = selectedCrew.memberPositions[uid] ?? "";
        const pending = manageMemberPositions[uid] ?? "";
        return persisted !== pending;
      })
    : false;

  async function handleSearchInvite() {
    const email = inviteEmail.trim();
    if (!email) {
      setSearchResultMessage("Enter an email to search.");
      setMatchedOfficials([]);
      return;
    }

    setSearching(true);
    setSearchResultMessage(null);
    setMatchedOfficials([]);

    try {
      const results = await searchOfficialProfilesByEmail(email);
      if (results.length === 0) {
        setSearchResultMessage("No official found for that email.");
      } else {
        setMatchedOfficials(results);
      }
    } catch (error) {
      setSearchResultMessage(
        getReadableFirestoreError(error, FIRESTORE_DATABASE_ID)
      );
    } finally {
      setSearching(false);
    }
  }

  function handleInviteOfficial(official: UserProfile) {
    if (hasMaximumMembers) {
      setFormError(`A crew can include up to ${MAX_CREW_MEMBERS} members.`);
      return;
    }

    setFormError(null);
    setSelectedMembers((current) => {
      if (current.some((member) => member.uid === official.uid)) {
        return current;
      }
      return [
        ...current,
        {
          uid: official.uid,
          name: official.displayName,
          email: official.email
        }
      ].sort(byName);
    });
    setSelectedMemberPositions((current) => ({
      ...current,
      [official.uid]: current[official.uid] ?? ""
    }));
  }

  function handleRemoveMember(memberUid: string) {
    if (activeProfile.role === "official" && memberUid === activeProfile.uid) {
      return;
    }

    setSelectedMembers((current) => current.filter((member) => member.uid !== memberUid));
    setSelectedMemberPositions((current) => {
      const next = { ...current };
      delete next[memberUid];
      return next;
    });
  }

  function handleSetSelectedMemberPosition(memberUid: string, position: FootballPosition | "") {
    setSelectedMemberPositions((current) => ({
      ...current,
      [memberUid]: position
    }));
  }

  async function handleCreateCrew(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);

    const trimmedName = crewName.trim();
    if (!trimmedName) {
      setFormError("Crew name is required.");
      return;
    }

    if (selectedMembers.length < 1 || selectedMembers.length > MAX_CREW_MEMBERS) {
      setFormError(`Crew must include between 1 and ${MAX_CREW_MEMBERS} members.`);
      return;
    }

    try {
      const normalizedPositions = normalizeMemberPositions(
        selectedMembers.map((member) => member.uid),
        selectedMemberPositions
      );
      if (getAssignedRefereeCount(normalizedPositions) > 1) {
        setFormError("Only one crew member can be assigned as Referee.");
        return;
      }

      setCreating(true);
      await createCrew(
        {
          name: trimmedName,
          members: selectedMembers,
          memberPositions: normalizedPositions
        },
        {
          uid: activeUser.uid,
          displayName: activeProfile.displayName,
          role: creatorRole
        }
      );

      setCrewName("");
      setInviteEmail("");
      setMatchedOfficials([]);
      setSearchResultMessage(null);
      setSelectedMembers(
        activeProfile.role === "official"
          ? [
              {
                uid: activeProfile.uid,
                name: activeProfile.displayName,
                email: activeProfile.email
              }
            ]
          : []
      );
      setSelectedMemberPositions(
        activeProfile.role === "official" ? { [activeProfile.uid]: "" } : {}
      );
      setModalMessage({
        title: "Crew Created",
        message: "Your crew was saved.",
        autoCloseMs: 1800
      });
    } catch (error) {
      setFormError(getReadableFirestoreError(error, FIRESTORE_DATABASE_ID));
    } finally {
      setCreating(false);
    }
  }

  async function handleConfirmDeleteCrew() {
    if (!deleteCrewId) {
      return;
    }

    const crewToDelete = visibleCrews.find((crew) => crew.id === deleteCrewId);
    if (!crewToDelete) {
      setDeleteCrewId(null);
      return;
    }

    if (crewToDelete.createdByUid !== activeUser.uid) {
      setDeleteCrewId(null);
      setModalMessage({
        title: "Not Allowed",
        message: "Only the crew creator can delete this crew."
      });
      return;
    }

    setDeletingCrew(true);
    try {
      await deleteCrew(crewToDelete.id);
      setDeleteCrewId(null);
      if (selectedCrewId === crewToDelete.id) {
        setSelectedCrewId(null);
      }
      setModalMessage({
        title: "Crew Deleted",
        message: `${crewToDelete.name} was deleted.`,
        autoCloseMs: 1800
      });
    } catch (error) {
      setDataError(getReadableFirestoreError(error, FIRESTORE_DATABASE_ID));
      setDeleteCrewId(null);
    } finally {
      setDeletingCrew(false);
    }
  }

  async function handleSearchManageInvite() {
    const email = manageInviteEmail.trim();
    if (!email) {
      setManageResultMessage("Enter an email to search.");
      setManageMatchedOfficials([]);
      return;
    }

    setManageSearching(true);
    setManageResultMessage(null);
    setManageMatchedOfficials([]);

    try {
      const results = await searchOfficialProfilesByEmail(email);
      if (results.length === 0) {
        setManageResultMessage("No official found for that email.");
      } else {
        setManageMatchedOfficials(results);
      }
    } catch (error) {
      setManageResultMessage(getReadableFirestoreError(error, FIRESTORE_DATABASE_ID));
    } finally {
      setManageSearching(false);
    }
  }

  async function handleAddMemberToSelectedCrew(official: UserProfile) {
    if (!selectedCrew) {
      return;
    }

    if (selectedCrew.createdByUid !== activeUser.uid) {
      setModalMessage({
        title: "Not Allowed",
        message: "Only the crew creator can manage members."
      });
      return;
    }

    const alreadyMember = selectedCrew.members.some((member) => member.uid === official.uid);
    if (alreadyMember) {
      return;
    }

    const nextMembers = [...selectedCrew.members, {
      uid: official.uid,
      name: official.displayName,
      email: official.email
    }].sort(byName);

    if (nextMembers.length > MAX_CREW_MEMBERS) {
      setModalMessage({
        title: "Crew Limit Reached",
        message: `A crew can include up to ${MAX_CREW_MEMBERS} members.`
      });
      return;
    }

    setUpdatingCrewMembers(true);
    try {
      await updateCrewMembers(selectedCrew.id, nextMembers);
      setManageResultMessage("Member added.");
      setManageInviteEmail("");
      setManageMatchedOfficials([]);
    } catch (error) {
      setDataError(getReadableFirestoreError(error, FIRESTORE_DATABASE_ID));
    } finally {
      setUpdatingCrewMembers(false);
    }
  }

  async function handleRemoveMemberFromSelectedCrew(memberUid: string) {
    if (!selectedCrew) {
      return;
    }

    if (selectedCrew.createdByUid !== activeUser.uid) {
      setModalMessage({
        title: "Not Allowed",
        message: "Only the crew creator can manage members."
      });
      return;
    }

    if (memberUid === selectedCrewChiefUid) {
      setModalMessage({
        title: "Chief Required",
        message: "Select a new crew chief before removing the current crew chief."
      });
      return;
    }

    const nextMembers = selectedCrew.members.filter((member) => member.uid !== memberUid);
    if (nextMembers.length < 1) {
      setModalMessage({
        title: "Member Required",
        message: "A crew must include at least 1 member."
      });
      return;
    }

    setUpdatingCrewMembers(true);
    try {
      await updateCrewMembers(selectedCrew.id, nextMembers.sort(byName));
      setManageResultMessage("Member removed.");
    } catch (error) {
      setDataError(getReadableFirestoreError(error, FIRESTORE_DATABASE_ID));
    } finally {
      setUpdatingCrewMembers(false);
    }
  }

  async function handleUpdateSelectedCrewChief() {
    if (!selectedCrew) {
      return;
    }

    if (selectedCrew.createdByUid !== activeUser.uid) {
      setModalMessage({
        title: "Not Allowed",
        message: "Only the crew creator can update the crew chief."
      });
      return;
    }

    const nextChiefUid = manageCrewChiefUid.trim();
    if (!nextChiefUid) {
      setModalMessage({
        title: "Crew Chief Required",
        message: "Select a crew chief."
      });
      return;
    }

    const selectedMember = selectedCrew.members.find((member) => member.uid === nextChiefUid);
    const chiefName =
      selectedMember?.name ??
      (nextChiefUid === selectedCrew.createdByUid ? selectedCrew.createdByName : "");

    if (!chiefName) {
      setModalMessage({
        title: "Invalid Crew Chief",
        message: "Crew chief must be a current member or the crew creator."
      });
      return;
    }

    setUpdatingCrewChief(true);
    try {
      await updateCrewChief(selectedCrew.id, {
        uid: nextChiefUid,
        name: chiefName
      });
      setManageResultMessage("Crew chief updated.");
    } catch (error) {
      setDataError(getReadableFirestoreError(error, FIRESTORE_DATABASE_ID));
    } finally {
      setUpdatingCrewChief(false);
    }
  }

  function handleSetManageMemberPosition(memberUid: string, position: FootballPosition | "") {
    setManageMemberPositions((current) => ({
      ...current,
      [memberUid]: position
    }));
  }

  async function handleSaveSelectedCrewPositions() {
    if (!selectedCrew) {
      return;
    }

    if (!canAssignSelectedCrewPositions) {
      setModalMessage({
        title: "Not Allowed",
        message: "Only the crew chief can assign crew positions."
      });
      return;
    }

    const normalizedPositions = normalizeMemberPositions(
      selectedCrew.memberUids,
      manageMemberPositions
    );
    if (getAssignedRefereeCount(normalizedPositions) > 1) {
      setModalMessage({
        title: "Referee Required",
        message: "Only one crew member can be assigned as Referee."
      });
      return;
    }

    setUpdatingCrewPositions(true);
    try {
      await updateCrewMemberPositions(selectedCrew.id, normalizedPositions);
      setModalMessage({
        title: "Crew Positions Updated",
        message: "Football positions were saved for this crew.",
        autoCloseMs: 1800
      });
    } catch (error) {
      setDataError(getReadableFirestoreError(error, FIRESTORE_DATABASE_ID));
    } finally {
      setUpdatingCrewPositions(false);
    }
  }

  return (
    <main className="page">
      <PageHeader
        eyebrow="Crew management"
        title="Crews"
        description="Create crews, manage membership, and keep football positions organized."
        stats={[
          { label: "Visible Crews", value: visibleCrews.length },
          { label: "Selected Crew Members", value: selectedMembers.length },
          { label: "Member Limit", value: MAX_CREW_MEMBERS }
        ]}
      />

      {dataError ? <p className="error-text">{dataError}</p> : null}

      <section className="crew-layout">
        <article className="crew-card">
          <h3>Create Crew</h3>
          <p className="meta-line">
            Crew chief defaults to the user who creates the crew.
          </p>
          <p className="meta-line">
            Crew bidding is restricted to the member assigned as Referee (R).
          </p>
          <form className="crew-form" onSubmit={handleCreateCrew}>
            <label>
              Crew Name
              <input
                type="text"
                value={crewName}
                onChange={(event) => setCrewName(event.target.value)}
                maxLength={80}
                placeholder="e.g. Friday Night Varsity Crew"
                required
              />
            </label>

            <div className="crew-invite-row">
              <label>
                Invite Official by Email
                <input
                  type="email"
                  value={inviteEmail}
                  onChange={(event) => setInviteEmail(event.target.value)}
                  placeholder="official@email.com"
                />
              </label>
              <button
                type="button"
                className="button-secondary"
                onClick={handleSearchInvite}
                disabled={searching}
              >
                {searching ? "Searching..." : "Search"}
              </button>
            </div>

            {searchResultMessage ? <p className="hint-text">{searchResultMessage}</p> : null}

            {matchedOfficials.length > 0 ? (
              <div className="crew-search-results">
                {matchedOfficials.map((official) => {
                  const alreadyInvited = selectedMembers.some(
                    (member) => member.uid === official.uid
                  );

                  return (
                    <div key={official.uid} className="crew-result-row">
                      <div>
                        <strong>{official.displayName}</strong>
                        <div className="meta-line">{official.email}</div>
                      </div>
                      <button
                        type="button"
                        className="button-secondary"
                        disabled={alreadyInvited || hasMaximumMembers}
                        onClick={() => handleInviteOfficial(official)}
                      >
                        {alreadyInvited ? "Added" : "Invite"}
                      </button>
                    </div>
                  );
                })}
              </div>
            ) : null}

            <div className="crew-members-header">
              <h4>Members</h4>
              <span>
                {selectedMembers.length}/{MAX_CREW_MEMBERS}
              </span>
            </div>

            {selectedMembers.length === 0 ? (
              <p className="empty-text">No members selected yet.</p>
            ) : (
              <ul className="crew-member-list">
                {selectedMembers.map((member) => {
                  const cannotRemove =
                    activeProfile.role === "official" && member.uid === activeProfile.uid;
                  const selectedPosition = selectedMemberPositions[member.uid] ?? "";

                  return (
                    <li key={member.uid} className="crew-member-item">
                      <div>
                        <strong>{member.name}</strong>
                        <div className="meta-line">{member.email}</div>
                        <label className="crew-position-control">
                          Position
                          <Select
                            value={selectedPosition}
                            onValueChange={(value) =>
                              handleSetSelectedMemberPosition(
                                member.uid,
                                value as FootballPosition | ""
                              )
                            }
                            options={[
                              { value: "", label: "Unassigned" },
                              ...FOOTBALL_POSITION_OPTIONS.map((option) => ({
                                value: option.code,
                                label: option.label
                              }))
                            ]}
                          />
                        </label>
                      </div>
                      <button
                        type="button"
                        className="button-link-danger"
                        onClick={() => handleRemoveMember(member.uid)}
                        disabled={cannotRemove}
                      >
                        {cannotRemove ? "You" : "Remove"}
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}

            {formError ? <p className="error-text">{formError}</p> : null}

            <div className="bid-form-actions">
              <button type="submit" disabled={creating}>
                {creating ? "Creating..." : "Create Crew"}
              </button>
            </div>
          </form>
        </article>

        <article className="crew-card">
          <h3>Your Crews</h3>
          {visibleCrews.length === 0 ? (
            <p className="empty-text">No crews yet.</p>
          ) : (
            <div className="crew-table-wrapper">
              <table className="crew-table">
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Created By</th>
                    <th>Crew Chief</th>
                    <th>Members</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleCrews.map((crew) => {
                    const canManageCrew = getCrewChiefUid(crew) === activeUser.uid;
                    const actionLabel = canManageCrew ? "Manage" : "View";

                    return (
                      <tr
                        key={crew.id}
                        className={`clickable-row${selectedCrewId === crew.id ? " crew-selected-row" : ""}`}
                        role="button"
                        tabIndex={0}
                        onClick={() => setSelectedCrewId(crew.id)}
                        onKeyDown={(event) => {
                          if (event.key === "Enter" || event.key === " ") {
                            event.preventDefault();
                            setSelectedCrewId(crew.id);
                          }
                        }}
                        aria-label={`${actionLabel} crew ${crew.name}`}
                      >
                        <td>{crew.name}</td>
                        <td>{crew.createdByName}</td>
                        <td>{getCrewChiefName(crew)}</td>
                        <td>{crew.memberUids.length}</td>
                        <td>
                          <button
                            type="button"
                            className="button-secondary"
                            onClick={(event) => {
                              event.stopPropagation();
                              setSelectedCrewId(crew.id);
                            }}
                          >
                            {actionLabel}
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </article>

        <article className="crew-card">
          <h3>
            {selectedCrew && getCrewChiefUid(selectedCrew) !== activeUser.uid
              ? "View Crew"
              : "Manage Crew"}
          </h3>
          {!selectedCrew ? (
            <p className="empty-text">Select a crew above to view details and members.</p>
          ) : (
            <>
              <p className="meta-line">
                <strong>Name:</strong> {selectedCrew.name}
              </p>
              <p className="meta-line">
                <strong>Created By:</strong> {selectedCrew.createdByName} ({selectedCrew.createdByRole})
              </p>
              <p className="meta-line">
                <strong>Created:</strong> {formatCreatedAt(selectedCrew.createdAtISO)}
              </p>
              <p className="meta-line">
                <strong>Total Members:</strong> {selectedCrew.memberUids.length}
              </p>
              <p className="meta-line">
                <strong>Crew Chief:</strong> {selectedCrewChiefName}
              </p>
              <p className="meta-line">
                <strong>Referee:</strong> {getCrewRefereeName(selectedCrew)}
              </p>

              <h4>Members</h4>
              {selectedCrew.members.length === 0 ? (
                <p className="empty-text">No crew members found.</p>
              ) : (
                <ul className="crew-member-list">
                  {selectedCrew.members.map((member) => {
                    const isCrewChief = member.uid === selectedCrewChiefUid;
                    const selectedPosition = manageMemberPositions[member.uid] ?? "";
                    return (
                      <li key={member.uid} className="crew-member-item">
                        <div>
                          <strong>
                            {member.name}
                            {isCrewChief ? " (Crew Chief)" : ""}
                          </strong>
                          <div className="meta-line">{member.email}</div>
                          <label className="crew-position-control">
                            Position
                            <Select
                              value={selectedPosition}
                              onValueChange={(value) =>
                                handleSetManageMemberPosition(
                                  member.uid,
                                  value as FootballPosition | ""
                                )
                              }
                              disabled={!canAssignSelectedCrewPositions || updatingCrewPositions}
                              options={[
                                { value: "", label: "Unassigned" },
                                ...FOOTBALL_POSITION_OPTIONS.map((option) => ({
                                  value: option.code,
                                  label: option.label
                                }))
                              ]}
                            />
                          </label>
                        </div>
                        {selectedCrew.createdByUid === activeUser.uid ? (
                          <button
                            type="button"
                            className="button-link-danger"
                            onClick={() => handleRemoveMemberFromSelectedCrew(member.uid)}
                            disabled={
                              updatingCrewMembers || updatingCrewChief || updatingCrewPositions
                            }
                          >
                            {updatingCrewMembers ? "Saving..." : "Remove"}
                          </button>
                        ) : null}
                      </li>
                    );
                  })}
                </ul>
              )}

              <div className="crew-actions">
                <button
                  type="button"
                  className="button-secondary"
                  onClick={handleSaveSelectedCrewPositions}
                  disabled={
                    !canAssignSelectedCrewPositions ||
                    updatingCrewPositions ||
                    updatingCrewMembers ||
                    updatingCrewChief ||
                    !hasManagePositionChanges
                  }
                >
                  {updatingCrewPositions ? "Saving..." : "Save Crew Positions"}
                </button>
                {!canAssignSelectedCrewPositions ? (
                  <span className="meta-line">Only the crew chief can assign positions.</span>
                ) : null}
              </div>

              {selectedCrew.createdByUid === activeUser.uid ? (
                <>
                  <div className="crew-invite-row crew-manage-tools">
                    <label>
                      Crew Chief
                      <Select
                        value={manageCrewChiefUid}
                        disabled={updatingCrewChief || updatingCrewMembers || updatingCrewPositions}
                        onValueChange={setManageCrewChiefUid}
                        options={chiefOptions.map((option) => ({
                          value: option.uid,
                          label: `${option.name}${
                            option.uid === selectedCrew.createdByUid ? " (Creator)" : ""
                          }`
                        }))}
                      />
                    </label>
                    <button
                      type="button"
                      className="button-secondary"
                      onClick={handleUpdateSelectedCrewChief}
                      disabled={
                        updatingCrewChief ||
                        updatingCrewMembers ||
                        !manageCrewChiefUid ||
                        manageCrewChiefUid === selectedCrewChiefUid
                      }
                    >
                      {updatingCrewChief ? "Saving..." : "Save Crew Chief"}
                    </button>
                  </div>

                  <div className="crew-invite-row crew-manage-tools">
                    <label>
                      Add Member by Email
                      <input
                        type="email"
                        value={manageInviteEmail}
                        onChange={(event) => setManageInviteEmail(event.target.value)}
                        placeholder="official@email.com"
                      />
                    </label>
                    <button
                      type="button"
                      className="button-secondary"
                      onClick={handleSearchManageInvite}
                      disabled={
                        manageSearching ||
                        updatingCrewMembers ||
                        updatingCrewChief ||
                        updatingCrewPositions
                      }
                    >
                      {manageSearching ? "Searching..." : "Search"}
                    </button>
                  </div>

                  {manageResultMessage ? <p className="hint-text">{manageResultMessage}</p> : null}

                  {manageMatchedOfficials.length > 0 ? (
                    <div className="crew-search-results">
                      {manageMatchedOfficials.map((official) => {
                        const alreadyMember = selectedCrew.members.some(
                          (member) => member.uid === official.uid
                        );
                        const atLimit = selectedCrew.members.length >= MAX_CREW_MEMBERS;

                        return (
                          <div key={official.uid} className="crew-result-row">
                            <div>
                              <strong>{official.displayName}</strong>
                              <div className="meta-line">{official.email}</div>
                            </div>
                            <button
                              type="button"
                              className="button-secondary"
                              disabled={
                                alreadyMember ||
                                atLimit ||
                                updatingCrewMembers ||
                                updatingCrewChief ||
                                updatingCrewPositions
                              }
                              onClick={() => handleAddMemberToSelectedCrew(official)}
                            >
                              {alreadyMember ? "Added" : atLimit ? "Limit Reached" : "Add"}
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  ) : null}

                  <div className="crew-actions">
                    <button
                      type="button"
                      className="button-danger"
                      onClick={() => setDeleteCrewId(selectedCrew.id)}
                      disabled={
                        deletingCrew ||
                        updatingCrewMembers ||
                        updatingCrewChief ||
                        updatingCrewPositions
                      }
                    >
                      Delete Crew
                    </button>
                  </div>
                </>
              ) : null}
            </>
          )}
        </article>
      </section>

      {modalMessage ? (
        <MessageModal
          title={modalMessage.title}
          message={modalMessage.message}
          autoCloseMs={modalMessage.autoCloseMs}
          onClose={() => setModalMessage(null)}
        />
      ) : null}

      {deleteCrewId ? (
        <MessageModal
          title="Delete Crew"
          message="Delete this crew permanently? This action cannot be undone."
          onClose={() => {
            if (!deletingCrew) {
              setDeleteCrewId(null);
            }
          }}
          onConfirm={handleConfirmDeleteCrew}
          confirmTone="danger"
          confirmLabel={deletingCrew ? "Deleting..." : "Delete Crew"}
          confirmDisabled={deletingCrew}
          cancelDisabled={deletingCrew}
        />
      ) : null}
    </main>
  );
}

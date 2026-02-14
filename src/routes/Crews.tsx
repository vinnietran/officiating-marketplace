import { useEffect, useMemo, useState } from "react";
import { AuthPanel } from "../components/AuthPanel";
import { CompleteProfilePanel } from "../components/CompleteProfilePanel";
import { MessageModal } from "../components/MessageModal";
import { useAuth } from "../context/AuthContext";
import { FIRESTORE_DATABASE_ID } from "../lib/firebase";
import { getReadableFirestoreError } from "../lib/firebaseErrors";
import {
  createCrew,
  searchOfficialProfilesByEmail,
  subscribeCrews
} from "../lib/firestore";
import type { Crew, CrewMember, UserProfile } from "../types";

const MAX_CREW_MEMBERS = 15;

function byName(a: CrewMember, b: CrewMember) {
  return a.name.localeCompare(b.name);
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
  const [formError, setFormError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [modalMessage, setModalMessage] = useState<{
    title: string;
    message: string;
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
  }, [profile]);

  const canAccessCrews = profile?.role === "official" || profile?.role === "assignor";

  const visibleCrews = useMemo(() => {
    if (!user || !profile) {
      return [];
    }

    if (profile.role === "official") {
      return crews.filter((crew) => crew.memberUids.includes(user.uid));
    }

    if (profile.role === "assignor") {
      return crews.filter((crew) => crew.createdByUid === user.uid);
    }

    return [];
  }, [crews, profile, user]);

  const hasMaximumMembers = selectedMembers.length >= MAX_CREW_MEMBERS;

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
          <p>Crews are available for officials and assignors.</p>
        </header>
      </main>
    );
  }

  const activeUser = user;
  const activeProfile = profile;
  const creatorRole: "official" | "assignor" =
    activeProfile.role === "official" ? "official" : "assignor";

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
  }

  function handleRemoveMember(memberUid: string) {
    if (activeProfile.role === "official" && memberUid === activeProfile.uid) {
      return;
    }

    setSelectedMembers((current) => current.filter((member) => member.uid !== memberUid));
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
      setCreating(true);
      await createCrew(
        {
          name: trimmedName,
          members: selectedMembers
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
      setModalMessage({
        title: "Crew Created",
        message: "Your crew was saved."
      });
    } catch (error) {
      setFormError(getReadableFirestoreError(error, FIRESTORE_DATABASE_ID));
    } finally {
      setCreating(false);
    }
  }

  return (
    <main className="page">
      <header className="hero">
        <h1>Crews</h1>
        <p>Create crews and manage members for team-based bidding.</p>
      </header>

      {dataError ? <p className="error-text">{dataError}</p> : null}

      <section className="crew-layout">
        <article className="crew-card">
          <h3>Create Crew</h3>
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

                  return (
                    <li key={member.uid} className="crew-member-item">
                      <div>
                        <strong>{member.name}</strong>
                        <div className="meta-line">{member.email}</div>
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
                    <th>Members</th>
                    <th>Member List</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleCrews.map((crew) => (
                    <tr key={crew.id}>
                      <td>{crew.name}</td>
                      <td>{crew.createdByName}</td>
                      <td>{crew.memberUids.length}</td>
                      <td>{crew.members.map((member) => member.name).join(", ")}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </article>
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

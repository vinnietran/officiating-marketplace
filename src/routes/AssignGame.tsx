import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { AssignGameForm } from "../components/AssignGameForm";
import { AuthPanel } from "../components/AuthPanel";
import { CompleteProfilePanel } from "../components/CompleteProfilePanel";
import { MessageModal } from "../components/MessageModal";
import { PageHeader } from "../components/ui/PageHeader";
import { useAuth } from "../context/AuthContext";
import { FIRESTORE_DATABASE_ID } from "../lib/firebase";
import { getReadableFirestoreError } from "../lib/firebaseErrors";
import {
  createAssignedGame,
  subscribeCrews,
  subscribeOfficialProfiles
} from "../lib/firestore";
import type { Crew, Game, GameAssignment, UserProfile } from "../types";

export function AssignGame() {
  const { user, profile, loading, profileLoading, signOut } = useAuth();
  const [crews, setCrews] = useState<Crew[]>([]);
  const [officialProfiles, setOfficialProfiles] = useState<UserProfile[]>([]);
  const [dataError, setDataError] = useState<string | null>(null);
  const [modalMessage, setModalMessage] = useState<{
    title: string;
    message: string;
    autoCloseMs?: number;
  } | null>(null);

  useEffect(() => {
    if (!user) {
      setCrews([]);
      setOfficialProfiles([]);
      return;
    }

    const unsubscribeCrews = subscribeCrews(setCrews, (error) =>
      setDataError(getReadableFirestoreError(error, FIRESTORE_DATABASE_ID))
    );
    const unsubscribeOfficials = subscribeOfficialProfiles(setOfficialProfiles, (error) =>
      setDataError(getReadableFirestoreError(error, FIRESTORE_DATABASE_ID))
    );

    return () => {
      unsubscribeCrews();
      unsubscribeOfficials();
    };
  }, [user]);

  const availableCrews = useMemo(() => {
    if (
      !user ||
      !profile ||
      (profile.role !== "assignor" && profile.role !== "school")
    ) {
      return [];
    }

    return [...crews].sort((a, b) => a.name.localeCompare(b.name));
  }, [crews, profile, user]);

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
          <h1>Assign Game</h1>
          <p>Sign in to assign games directly.</p>
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
          <h1>Assign Game</h1>
        </header>
        <CompleteProfilePanel />
      </main>
    );
  }

  if (profile.role !== "assignor" && profile.role !== "school") {
    return (
      <main className="page">
        <header className="hero">
          <h1>Assign Game</h1>
          <p>Only assignors and schools can assign games.</p>
        </header>
        <Link to="/marketplace" className="button-secondary details-back-link">
          Back to Marketplace
        </Link>
      </main>
    );
  }

  const activeUser = user;
  const activeProfile = profile;
  const postingRole: "assignor" | "school" =
    activeProfile.role === "assignor" ? "assignor" : "school";

  async function handleAssignGame(values: {
    schoolName: string;
    sport: Game["sport"];
    level: Game["level"];
    requestedCrewSize: number;
    dateISO: string;
    scheduledDateKey: string;
    location: string;
    payPosted: number;
    notes?: string;
    directAssignments: GameAssignment[];
  }) {
    await createAssignedGame(values, {
      uid: activeUser.uid,
      role: postingRole,
      displayName: activeProfile.displayName
    });

    setModalMessage({
      title: "Game Assigned",
      message: "Your game was directly assigned.",
      autoCloseMs: 1800
    });
  }

  return (
    <main className="page post-game-page">
      <PageHeader
        eyebrow="Direct staffing"
        title="Assign Game"
        description="Create a game and assign crews or individuals without a bidding workflow."
        stats={[
          { label: "Workflow", value: "Immediate assignment" },
          { label: "Supports", value: "Crews and individuals" }
        ]}
      />

      <section className="session-bar">
        <div>
          <strong>{activeProfile.displayName}</strong> ({activeProfile.role})
          <div className="meta-line">{activeProfile.email}</div>
        </div>
        <button type="button" className="button-secondary" onClick={() => signOut()}>
          Sign Out
        </button>
      </section>

      {dataError ? <p className="error-text">{dataError}</p> : null}

      <section className="post-game-layout">
        <article className="post-game-info-card">
          <h3>Assignment Tips</h3>
          <ul className="support-list">
            <li>This mode creates a game as already assigned, so bidding is disabled.</li>
            <li>For football, set a position for each individual assignee to avoid ambiguity.</li>
            <li>
              Need crews first? Create them in the <Link to="/crews">Crews</Link> tab.
            </li>
          </ul>
        </article>

        <AssignGameForm
          availableCrews={availableCrews}
          availableOfficials={officialProfiles}
          onSubmit={handleAssignGame}
        />
      </section>

      {modalMessage ? (
        <MessageModal
          title={modalMessage.title}
          message={modalMessage.message}
          autoCloseMs={modalMessage.autoCloseMs}
          onClose={() => setModalMessage(null)}
        />
      ) : null}
    </main>
  );
}

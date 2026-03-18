import { useState } from "react";
import { Link } from "react-router-dom";
import { AuthPanel } from "../components/AuthPanel";
import { CompleteProfilePanel } from "../components/CompleteProfilePanel";
import { MessageModal } from "../components/MessageModal";
import { PostGameForm } from "../components/PostGameForm";
import { PageHeader } from "../components/ui/PageHeader";
import { useAuth } from "../context/AuthContext";
import { createGame } from "../lib/firestore";
import type { Game } from "../types";

export function PostGame() {
  const { user, profile, loading, profileLoading, signOut } = useAuth();
  const [modalMessage, setModalMessage] = useState<{
    title: string;
    message: string;
    autoCloseMs?: number;
  } | null>(null);

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
          <h1>Post a Game</h1>
          <p>Sign in to post new assignments.</p>
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
          <h1>Post a Game</h1>
        </header>
        <CompleteProfilePanel />
      </main>
    );
  }

  if (profile.role !== "assignor" && profile.role !== "school") {
    return (
      <main className="page">
        <header className="hero">
          <h1>Post a Game</h1>
          <p>Only assignors and schools can post games.</p>
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

  async function handlePostGame(values: {
    schoolName: string;
    sport: Game["sport"];
    level: Game["level"];
    dateISO: string;
    acceptingBidsUntilISO?: string;
    location: string;
    payPosted: number;
    notes?: string;
  }) {
    await createGame(values, {
      uid: activeUser.uid,
      role: postingRole,
      displayName: activeProfile.displayName
    });

    setModalMessage({
      title: "Game Posted",
      message: "Your game was posted successfully.",
      autoCloseMs: 1800
    });
  }

  return (
    <main className="page post-game-page">
      <PageHeader
        eyebrow="Game intake"
        title="Post a Game"
        description="Create a polished listing with clear timing, location, and bidding rules."
        stats={[
          { label: "Workflow", value: "Marketplace bidding" },
          { label: "Recommended", value: "Set a bid deadline" }
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

      <section className="post-game-layout">
        <article className="post-game-info-card">
          <h3>Posting Tips</h3>
          <ul className="support-list">
            <li>Include a precise location and realistic posted pay to attract qualified officials.</li>
            <li>Set an accepting-bids deadline to keep the auction window predictable.</li>
            <li>Edit the game later from Marketplace or Schedule if operations change.</li>
          </ul>
        </article>

        <PostGameForm onSubmit={handlePostGame} />
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

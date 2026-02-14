import { useState } from "react";
import { Link } from "react-router-dom";
import { AuthPanel } from "../components/AuthPanel";
import { CompleteProfilePanel } from "../components/CompleteProfilePanel";
import { MessageModal } from "../components/MessageModal";
import { PostGameForm } from "../components/PostGameForm";
import { useAuth } from "../context/AuthContext";
import { createGame } from "../lib/firestore";
import type { Game } from "../types";

export function PostGame() {
  const { user, profile, loading, profileLoading, signOut } = useAuth();
  const [modalMessage, setModalMessage] = useState<{
    title: string;
    message: string;
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

  if (profile.role === "official") {
    return (
      <main className="page">
        <header className="hero">
          <h1>Post a Game</h1>
          <p>Only assignors and schools can post games.</p>
        </header>
        <Link to="/" className="button-secondary details-back-link">
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
      message: "Your game was posted successfully."
    });
  }

  return (
    <main className="page">
      <header className="hero">
        <h1>Post a Game</h1>
        <p>Create a new assignment for officials to bid on.</p>
      </header>

      <section className="session-bar">
        <div>
          <strong>{activeProfile.displayName}</strong> ({activeProfile.role})
          <div className="meta-line">{activeProfile.email}</div>
        </div>
        <button type="button" className="button-secondary" onClick={() => signOut()}>
          Sign Out
        </button>
      </section>

      <PostGameForm onSubmit={handlePostGame} />

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

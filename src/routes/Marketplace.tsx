import { useEffect, useMemo, useState } from "react";
import { AuthPanel } from "../components/AuthPanel";
import { CompleteProfilePanel } from "../components/CompleteProfilePanel";
import { Filters, type FilterValues } from "../components/Filters";
import { GameCard } from "../components/GameCard";
import { MessageModal } from "../components/MessageModal";
import { useAuth } from "../context/AuthContext";
import {
  createBid,
  deleteBid,
  subscribeCrews,
  subscribeBids,
  subscribeGames,
  updateBid,
  updateGame
} from "../lib/firestore";
import { FIRESTORE_DATABASE_ID } from "../lib/firebase";
import { getReadableFirestoreError } from "../lib/firebaseErrors";
import type { Bid, Crew, Game } from "../types";

const DEFAULT_FILTERS: FilterValues = {
  search: "",
  sport: "All",
  level: "All",
  minPay: ""
};

export function Marketplace() {
  const { user, profile, loading, profileLoading, signOut } = useAuth();

  const [filters, setFilters] = useState<FilterValues>(DEFAULT_FILTERS);
  const [games, setGames] = useState<Game[]>([]);
  const [bids, setBids] = useState<Bid[]>([]);
  const [crews, setCrews] = useState<Crew[]>([]);
  const [dataError, setDataError] = useState<string | null>(null);
  const [modalMessage, setModalMessage] = useState<{
    title: string;
    message: string;
  } | null>(null);

  useEffect(() => {
    if (!user) {
      setGames([]);
      setBids([]);
      setCrews([]);
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

    return () => {
      unsubscribeGames();
      unsubscribeBids();
      unsubscribeCrews();
    };
  }, [user]);

  const filteredGames = useMemo(() => {
    const minPay = filters.minPay.trim() === "" ? null : Number(filters.minPay);

    return games.filter((game) => {
      const matchesSearch = game.schoolName
        .toLowerCase()
        .includes(filters.search.trim().toLowerCase());
      const matchesSport = filters.sport === "All" || game.sport === filters.sport;
      const matchesLevel = filters.level === "All" || game.level === filters.level;
      const matchesPay =
        minPay === null || Number.isNaN(minPay) ? true : game.payPosted >= minPay;

      return matchesSearch && matchesSport && matchesLevel && matchesPay;
    });
  }, [games, filters]);

  const officialCrews = useMemo(() => {
    if (!user || profile?.role !== "official") {
      return [];
    }

    return crews.filter((crew) => crew.memberUids.includes(user.uid));
  }, [crews, profile?.role, user]);

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
          <h1>Officiating Marketplace</h1>
          <p>Sign in to bid on games or post assignments.</p>
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
          <h1>Officiating Marketplace</h1>
        </header>
        <CompleteProfilePanel />
      </main>
    );
  }

  const activeUser = user;
  const activeProfile = profile;
  const canPostGames =
    activeProfile.role === "assignor" || activeProfile.role === "school";

  async function handleUpdateGame(
    gameId: string,
    values: {
      schoolName: string;
      sport: Game["sport"];
      level: Game["level"];
      dateISO: string;
      acceptingBidsUntilISO?: string;
      location: string;
      payPosted: number;
      notes?: string;
    }
  ) {
    if (activeProfile.role === "official") {
      throw new Error("Only assignors and schools can edit games.");
    }

    const game = games.find((candidate) => candidate.id === gameId);
    if (!game || game.createdByUid !== activeUser.uid) {
      throw new Error("You can only edit games that you posted.");
    }

    await updateGame(gameId, values);
  }

  async function handleSubmitBid(
    gameId: string,
    input: {
      officialName: string;
      bidderType: "individual" | "crew";
      crewId?: string;
      crewName?: string;
      amount: number;
      message?: string;
    }
  ) {
    if (activeProfile.role !== "official") {
      throw new Error("Only officials can place bids.");
    }

    const game = games.find((candidate) => candidate.id === gameId);
    if (!game) {
      throw new Error("Game not found.");
    }

    if (game.status !== "open") {
      throw new Error("Bidding is closed for this game.");
    }

    const gameBids = bids.filter((bid) => bid.gameId === gameId);
    const selectedCrew =
      input.bidderType === "crew" && input.crewId
        ? officialCrews.find((crew) => crew.id === input.crewId) ?? null
        : null;

    if (input.bidderType === "crew" && !selectedCrew) {
      throw new Error("Select one of your crews to place a crew bid.");
    }

    const latestIdentityBid = [...gameBids]
      .filter((bid) => {
        if (input.bidderType === "crew") {
          return (
            bid.officialUid === activeUser.uid &&
            bid.bidderType === "crew" &&
            bid.crewId === selectedCrew?.id
          );
        }

        return (
          bid.officialUid === activeUser.uid &&
          (!bid.bidderType || bid.bidderType === "individual")
        );
      })
      .sort((a, b) => b.createdAtISO.localeCompare(a.createdAtISO))[0];

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
      gameId,
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

  async function handleDeleteBid(bidId: string) {
    await deleteBid(bidId);
  }

  return (
    <main className="page">
      <header className="hero">
        <h1>Officiating Marketplace</h1>
        <p>Find local games, post assignments, and manage bids.</p>
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

      <Filters values={filters} onChange={setFilters} />

      <section className="results-header">
        <h2>Available Games</h2>
        <span>{filteredGames.length} result(s)</span>
      </section>

      {dataError ? <p className="error-text">{dataError}</p> : null}

      <section className="game-list">
        {filteredGames.length === 0 ? (
          <div className="empty-state">No games match your filters.</div>
        ) : (
          filteredGames.map((game) => (
            <GameCard
              key={game.id}
              game={game}
              bids={bids}
              role={activeProfile.role}
              currentUserId={activeUser.uid}
              currentUserName={activeProfile.displayName}
              availableCrews={officialCrews}
              canManageGame={canPostGames && game.createdByUid === activeUser.uid}
              onSubmitBid={handleSubmitBid}
              onDeleteBid={handleDeleteBid}
              onUpdateGame={handleUpdateGame}
            />
          ))
        )}
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

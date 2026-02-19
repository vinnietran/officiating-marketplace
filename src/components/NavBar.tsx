import { useEffect, useMemo, useRef, useState } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { formatGameDate } from "../lib/format";
import { subscribeBids, subscribeCrews, subscribeGames } from "../lib/firestore";
import type { Bid, Crew, Game } from "../types";
import { MessageModal } from "./MessageModal";

type InAppNotificationType = "game_assigned" | "bid_won";

interface InAppNotification {
  id: string;
  type: InAppNotificationType;
  gameId: string;
  gameDateISO: string;
  sortISO: string;
  title: string;
  message: string;
}

const SEEN_NOTIFICATIONS_STORAGE_PREFIX = "officiating-marketplace:seen-notifications:";
const DISMISSED_NOTIFICATIONS_STORAGE_PREFIX =
  "officiating-marketplace:dismissed-notifications:";

function getSeenStorageKey(uid: string): string {
  return `${SEEN_NOTIFICATIONS_STORAGE_PREFIX}${uid}`;
}

function getDismissedStorageKey(uid: string): string {
  return `${DISMISSED_NOTIFICATIONS_STORAGE_PREFIX}${uid}`;
}

function isAssignedViaDirectAssignment(game: Game, userId: string): boolean {
  return (game.directAssignments ?? []).some((assignment) => {
    if (assignment.assignmentType === "individual") {
      return assignment.officialUid === userId;
    }
    return assignment.memberUids.includes(userId);
  });
}

function isAssignedViaAwardedBid(
  selectedBid: Bid,
  userId: string,
  crewsById: Map<string, Crew>
): boolean {
  if (selectedBid.officialUid === userId) {
    return true;
  }

  if (selectedBid.bidderType !== "crew" || !selectedBid.crewId) {
    return false;
  }

  const awardedCrew = crewsById.get(selectedBid.crewId);
  if (!awardedCrew) {
    return false;
  }

  return awardedCrew.memberUids.includes(userId);
}

export function NavBar() {
  const navigate = useNavigate();
  const { user, profile, signOut } = useAuth();
  const [modalMessage, setModalMessage] = useState<{
    title: string;
    message: string;
  } | null>(null);
  const [games, setGames] = useState<Game[]>([]);
  const [bids, setBids] = useState<Bid[]>([]);
  const [crews, setCrews] = useState<Crew[]>([]);
  const [seenNotificationIds, setSeenNotificationIds] = useState<string[]>([]);
  const [dismissedNotificationIds, setDismissedNotificationIds] = useState<string[]>([]);
  const [notificationsMenuOpen, setNotificationsMenuOpen] = useState(false);
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);
  const notificationsMenuRef = useRef<HTMLDivElement | null>(null);
  const profileMenuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!user) {
      setGames([]);
      setBids([]);
      setCrews([]);
      return;
    }

    const unsubscribeGames = subscribeGames(setGames);
    const unsubscribeBids = subscribeBids(setBids);
    const unsubscribeCrews = subscribeCrews(setCrews);

    return () => {
      unsubscribeGames();
      unsubscribeBids();
      unsubscribeCrews();
    };
  }, [user]);

  useEffect(() => {
    if (!user) {
      setSeenNotificationIds([]);
      return;
    }

    try {
      const raw = window.localStorage.getItem(getSeenStorageKey(user.uid));
      if (!raw) {
        setSeenNotificationIds([]);
        return;
      }

      const parsed = JSON.parse(raw) as unknown;
      if (Array.isArray(parsed) && parsed.every((entry) => typeof entry === "string")) {
        setSeenNotificationIds(parsed);
        return;
      }
    } catch {
      // Ignore malformed local state.
    }

    setSeenNotificationIds([]);
  }, [user]);

  useEffect(() => {
    if (!user) {
      setDismissedNotificationIds([]);
      return;
    }

    try {
      const raw = window.localStorage.getItem(getDismissedStorageKey(user.uid));
      if (!raw) {
        setDismissedNotificationIds([]);
        return;
      }

      const parsed = JSON.parse(raw) as unknown;
      if (Array.isArray(parsed) && parsed.every((entry) => typeof entry === "string")) {
        setDismissedNotificationIds(parsed);
        return;
      }
    } catch {
      // Ignore malformed local state.
    }

    setDismissedNotificationIds([]);
  }, [user]);

  useEffect(() => {
    if (!user) {
      return;
    }

    try {
      window.localStorage.setItem(
        getSeenStorageKey(user.uid),
        JSON.stringify(seenNotificationIds)
      );
    } catch {
      // Ignore storage failures.
    }
  }, [seenNotificationIds, user]);

  useEffect(() => {
    if (!user) {
      return;
    }

    try {
      window.localStorage.setItem(
        getDismissedStorageKey(user.uid),
        JSON.stringify(dismissedNotificationIds)
      );
    } catch {
      // Ignore storage failures.
    }
  }, [dismissedNotificationIds, user]);

  useEffect(() => {
    if (!profileMenuOpen && !notificationsMenuOpen) {
      return;
    }

    function handleDocumentClick(event: MouseEvent) {
      const target = event.target as Node | null;
      if (
        target &&
        ((profileMenuRef.current && profileMenuRef.current.contains(target)) ||
          (notificationsMenuRef.current && notificationsMenuRef.current.contains(target)))
      ) {
        return;
      }

      setProfileMenuOpen(false);
      setNotificationsMenuOpen(false);
    }

    function handleEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setProfileMenuOpen(false);
        setNotificationsMenuOpen(false);
      }
    }

    document.addEventListener("mousedown", handleDocumentClick);
    document.addEventListener("keydown", handleEscape);

    return () => {
      document.removeEventListener("mousedown", handleDocumentClick);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [notificationsMenuOpen, profileMenuOpen]);

  const notifications = useMemo<InAppNotification[]>(() => {
    if (!user) {
      return [];
    }

    const bidsById = new Map<string, Bid>();
    bids.forEach((bid) => bidsById.set(bid.id, bid));

    const crewsById = new Map<string, Crew>();
    crews.forEach((crew) => crewsById.set(crew.id, crew));

    const nextNotifications: InAppNotification[] = [];

    games.forEach((game) => {
      if (game.status !== "awarded") {
        return;
      }

      if (game.mode === "direct_assignment") {
        if (!isAssignedViaDirectAssignment(game, user.uid)) {
          return;
        }

        nextNotifications.push({
          id: `game_assigned:${game.id}:direct`,
          type: "game_assigned",
          gameId: game.id,
          gameDateISO: game.dateISO,
          sortISO: game.dateISO,
          title: "Game Assigned",
          message: `You were assigned to ${game.schoolName} (${game.sport} • ${game.level}).`
        });
        return;
      }

      if (!game.selectedBidId) {
        return;
      }

      const selectedBid = bidsById.get(game.selectedBidId);
      if (!selectedBid) {
        return;
      }

      const bidWonByUser = selectedBid.officialUid === user.uid;
      if (bidWonByUser) {
        nextNotifications.push({
          id: `bid_won:${game.id}:${selectedBid.id}`,
          type: "bid_won",
          gameId: game.id,
          gameDateISO: game.dateISO,
          sortISO: game.dateISO,
          title: "Bid Won",
          message: `Your bid for ${game.schoolName} (${game.sport} • ${game.level}) was awarded.`
        });
        return;
      }

      if (!isAssignedViaAwardedBid(selectedBid, user.uid, crewsById)) {
        return;
      }

      nextNotifications.push({
        id: `game_assigned:${game.id}:${selectedBid.id}`,
        type: "game_assigned",
        gameId: game.id,
        gameDateISO: game.dateISO,
        sortISO: game.dateISO,
        title: "Game Assigned",
        message: `You were assigned to ${game.schoolName} (${game.sport} • ${game.level}).`
      });
    });

    return nextNotifications.sort((a, b) => b.sortISO.localeCompare(a.sortISO));
  }, [bids, crews, games, user]);

  const seenNotificationIdSet = useMemo(
    () => new Set(seenNotificationIds),
    [seenNotificationIds]
  );
  const dismissedNotificationIdSet = useMemo(
    () => new Set(dismissedNotificationIds),
    [dismissedNotificationIds]
  );
  const visibleNotifications = useMemo(
    () =>
      notifications.filter(
        (notification) => !dismissedNotificationIdSet.has(notification.id)
      ),
    [dismissedNotificationIdSet, notifications]
  );

  const unreadNotificationCount = useMemo(
    () =>
      visibleNotifications.filter(
        (notification) => !seenNotificationIdSet.has(notification.id)
      ).length,
    [seenNotificationIdSet, visibleNotifications]
  );

  useEffect(() => {
    if (!notificationsMenuOpen || visibleNotifications.length === 0) {
      return;
    }

    setSeenNotificationIds((current) => {
      const merged = new Set(current);
      visibleNotifications.forEach((notification) => merged.add(notification.id));
      return Array.from(merged);
    });
  }, [notificationsMenuOpen, visibleNotifications]);

  function getProfileInitial(): string {
    const displayName = profile?.displayName?.trim();
    if (displayName) {
      return displayName.charAt(0).toUpperCase();
    }

    const email = user?.email?.trim();
    if (email) {
      return email.charAt(0).toUpperCase();
    }

    return "U";
  }

  async function handleSignOut() {
    setProfileMenuOpen(false);
    setNotificationsMenuOpen(false);
    try {
      await signOut();
      navigate("/", { replace: true });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to sign out.";
      setModalMessage({
        title: "Sign Out Error",
        message
      });
    }
  }

  function handleNotificationMenuToggle() {
    setNotificationsMenuOpen((current) => !current);
    setProfileMenuOpen(false);
  }

  function handleNotificationClick(notification: InAppNotification) {
    setNotificationsMenuOpen(false);
    navigate(`/schedule/games/${notification.gameId}`, {
      state: { from: "schedule" }
    });
  }

  function handleClearNotifications() {
    setDismissedNotificationIds((current) => {
      const merged = new Set(current);
      visibleNotifications.forEach((notification) => merged.add(notification.id));
      return Array.from(merged);
    });
    setSeenNotificationIds((current) => {
      const merged = new Set(current);
      visibleNotifications.forEach((notification) => merged.add(notification.id));
      return Array.from(merged);
    });
  }

  return (
    <>
      <nav className="top-nav">
        <div className="top-nav-inner">
          <div className="top-nav-links">
            {user && profile && profile.role !== "evaluator" ? (
              <NavLink
                to="/dashboard"
                className={({ isActive }) => `nav-link${isActive ? " active" : ""}`}
              >
                Dashboard
              </NavLink>
            ) : null}
            {!user || profile?.role !== "evaluator" ? (
              <NavLink
                to="/marketplace"
                className={({ isActive }) => `nav-link${isActive ? " active" : ""}`}
              >
                Marketplace
              </NavLink>
            ) : null}
            <NavLink
              to="/schedule"
              className={({ isActive }) => `nav-link${isActive ? " active" : ""}`}
            >
              Schedule
            </NavLink>
            {user &&
            profile &&
            (profile.role === "official" ||
              profile.role === "assignor" ||
              profile.role === "school") ? (
              <NavLink
                to="/crews"
                className={({ isActive }) => `nav-link${isActive ? " active" : ""}`}
              >
                Crews
              </NavLink>
            ) : null}
            {user && profile && (profile.role === "assignor" || profile.role === "school") ? (
              <NavLink
                to="/assign-game"
                className={({ isActive }) => `nav-link${isActive ? " active" : ""}`}
              >
                Assign Game
              </NavLink>
            ) : null}
            {user && profile && (profile.role === "assignor" || profile.role === "school") ? (
              <NavLink
                to="/post-game"
                className={({ isActive }) => `nav-link${isActive ? " active" : ""}`}
              >
                Post a Game
              </NavLink>
            ) : null}
          </div>

          {user ? (
            <div className="top-nav-actions">
              <div className="notification-menu-container" ref={notificationsMenuRef}>
                <button
                  type="button"
                  className="icon-button nav-icon-button"
                  aria-label={`Notifications (${unreadNotificationCount} unread)`}
                  aria-haspopup="menu"
                  aria-expanded={notificationsMenuOpen}
                  onClick={handleNotificationMenuToggle}
                >
                  <svg viewBox="0 0 24 24" aria-hidden="true">
                    <path
                      d="M12 3a5 5 0 0 0-5 5v2.2c0 .7-.2 1.3-.6 1.9L5 14.5V16h14v-1.5l-1.4-2.4a3.8 3.8 0 0 1-.6-1.9V8a5 5 0 0 0-5-5Zm0 18a2.5 2.5 0 0 0 2.4-2h-4.8A2.5 2.5 0 0 0 12 21Z"
                      fill="currentColor"
                    />
                  </svg>
                  {unreadNotificationCount > 0 ? (
                    <span className="notification-badge" aria-hidden="true">
                      {unreadNotificationCount > 99 ? "99+" : unreadNotificationCount}
                    </span>
                  ) : null}
                </button>

                {notificationsMenuOpen ? (
                  <div className="notification-menu" role="menu" aria-label="Notifications">
                    <div className="notification-menu-header">
                      <strong>Notifications</strong>
                      <div className="notification-menu-header-actions">
                        <span>{visibleNotifications.length}</span>
                        {visibleNotifications.length > 0 ? (
                          <button
                            type="button"
                            className="notification-clear-button"
                            onClick={handleClearNotifications}
                          >
                            Clear all
                          </button>
                        ) : null}
                      </div>
                    </div>
                    {visibleNotifications.length === 0 ? (
                      <p className="notification-empty-state">No notifications yet.</p>
                    ) : (
                      <div className="notification-list">
                        {visibleNotifications.map((notification) => {
                          const unread = !seenNotificationIdSet.has(notification.id);
                          return (
                            <button
                              key={notification.id}
                              type="button"
                              className={`notification-item${
                                unread ? " notification-item-unread" : ""
                              }`}
                              onClick={() => handleNotificationClick(notification)}
                            >
                              <div className="notification-item-head">
                                <strong>{notification.title}</strong>
                                <span>{formatGameDate(notification.gameDateISO)}</span>
                              </div>
                              <p>{notification.message}</p>
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                ) : null}
              </div>

              <div className="profile-menu-container" ref={profileMenuRef}>
                <button
                  type="button"
                  className="icon-button nav-icon-button profile-avatar-button"
                  aria-label="Profile menu"
                  aria-haspopup="menu"
                  aria-expanded={profileMenuOpen}
                  onClick={() => {
                    setProfileMenuOpen((current) => !current);
                    setNotificationsMenuOpen(false);
                  }}
                >
                  <span className="profile-avatar">{getProfileInitial()}</span>
                </button>

                {profileMenuOpen ? (
                  <div className="profile-menu" role="menu" aria-label="Profile menu">
                    <button
                      type="button"
                      className="profile-menu-item"
                      role="menuitem"
                      onClick={() => {
                        setProfileMenuOpen(false);
                        navigate("/profile");
                      }}
                    >
                      View Profile
                    </button>
                    <button
                      type="button"
                      className="profile-menu-item profile-menu-item-danger"
                      role="menuitem"
                      onClick={() => {
                        void handleSignOut();
                      }}
                    >
                      Sign Out
                    </button>
                  </div>
                ) : null}
              </div>
            </div>
          ) : null}
        </div>
      </nav>

      {modalMessage ? (
        <MessageModal
          title={modalMessage.title}
          message={modalMessage.message}
          onClose={() => setModalMessage(null)}
        />
      ) : null}
    </>
  );
}

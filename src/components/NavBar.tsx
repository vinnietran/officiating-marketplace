import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import * as ScrollArea from "@radix-ui/react-scroll-area";
import {
  Bell,
  CalendarDays,
  CalendarRange,
  ChevronDown,
  ClipboardPlus,
  LayoutDashboard,
  LogOut,
  Menu,
  Store,
  X,
  User,
  Users
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link, NavLink, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import {
  isOfficialAssignedToAwardedMarketplaceGame,
  isOfficialAssignedToDirectGame
} from "../lib/gameAssignments";
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

function formatRoleLabel(role: string | undefined): string {
  if (!role) {
    return "";
  }

  return role.charAt(0).toUpperCase() + role.slice(1);
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

export function NavBar() {
  const navigate = useNavigate();
  const location = useLocation();
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
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

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
        if (!isOfficialAssignedToDirectGame(game, user.uid)) {
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

      if (!isOfficialAssignedToAwardedMarketplaceGame(selectedBid, crewsById, user.uid)) {
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

  useEffect(() => {
    setMobileMenuOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return undefined;
    }

    const mediaQuery = window.matchMedia("(max-width: 640px)");
    const handleViewportChange = (event?: MediaQueryListEvent) => {
      if (!(event?.matches ?? mediaQuery.matches)) {
        setMobileMenuOpen(false);
      }
    };

    handleViewportChange();

    if (typeof mediaQuery.addEventListener === "function") {
      mediaQuery.addEventListener("change", handleViewportChange);
      return () => mediaQuery.removeEventListener("change", handleViewportChange);
    }

    mediaQuery.addListener(handleViewportChange);
    return () => mediaQuery.removeListener(handleViewportChange);
  }, []);

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
          <div className="top-nav-primary">
            <div className="top-nav-mobile-bar">
              <Link to="/" className="top-nav-brand" aria-label="Go to home">
                <span className="top-nav-brand-mark" aria-hidden="true">
                  OM
                </span>
                <span className="top-nav-brand-copy">
                  <strong>Officiating Marketplace</strong>
                  <span>Operations platform</span>
                </span>
              </Link>
              <button
                type="button"
                className="icon-button nav-icon-button top-nav-menu-button"
                aria-label={mobileMenuOpen ? "Close navigation menu" : "Open navigation menu"}
                aria-expanded={mobileMenuOpen}
                aria-controls="mobile-navigation-links"
                onClick={() => setMobileMenuOpen((current) => !current)}
              >
                {mobileMenuOpen ? <X aria-hidden="true" /> : <Menu aria-hidden="true" />}
              </button>
            </div>

            <div
              id="mobile-navigation-links"
              className={`top-nav-links${mobileMenuOpen ? " top-nav-links-mobile-open" : ""}`}
            >
              {user && profile && profile.role !== "evaluator" ? (
                <NavLink
                  to="/dashboard"
                  className={({ isActive }) => `nav-link${isActive ? " active" : ""}`}
                >
                  <LayoutDashboard aria-hidden="true" />
                  Dashboard
                </NavLink>
              ) : null}
              {!user || profile?.role !== "evaluator" ? (
                <NavLink
                  to="/marketplace"
                  className={({ isActive }) => `nav-link${isActive ? " active" : ""}`}
                >
                  <Store aria-hidden="true" />
                  Marketplace
                </NavLink>
              ) : null}
              <NavLink
                to="/schedule"
                className={({ isActive }) => `nav-link${isActive ? " active" : ""}`}
              >
                <CalendarDays aria-hidden="true" />
                Schedule
              </NavLink>
              {user && profile && profile.role === "official" ? (
                <NavLink
                  to="/availability"
                  className={({ isActive }) => `nav-link${isActive ? " active" : ""}`}
                >
                  <CalendarRange aria-hidden="true" />
                  Availability
                </NavLink>
              ) : null}
              {user &&
              profile &&
              (profile.role === "official" ||
                profile.role === "assignor" ||
                profile.role === "school") ? (
                <NavLink
                  to="/crews"
                  className={({ isActive }) => `nav-link${isActive ? " active" : ""}`}
                >
                  <Users aria-hidden="true" />
                  Crews
                </NavLink>
              ) : null}
              {user && profile && (profile.role === "assignor" || profile.role === "school") ? (
                <NavLink
                  to="/assign-game"
                  className={({ isActive }) => `nav-link${isActive ? " active" : ""}`}
                >
                  <ClipboardPlus aria-hidden="true" />
                  Assign Game
                </NavLink>
              ) : null}
              {user && profile && (profile.role === "assignor" || profile.role === "school") ? (
                <NavLink
                  to="/post-game"
                  className={({ isActive }) => `nav-link${isActive ? " active" : ""}`}
                >
                  <ClipboardPlus aria-hidden="true" />
                  Post a Game
                </NavLink>
              ) : null}
            </div>
          </div>

          {user ? (
            <div className="top-nav-actions">
              <DropdownMenu.Root
                open={notificationsMenuOpen}
                onOpenChange={setNotificationsMenuOpen}
              >
                <DropdownMenu.Trigger asChild>
                  <button
                    type="button"
                    className="icon-button nav-icon-button"
                    aria-label={`Notifications (${unreadNotificationCount} unread)`}
                  >
                    <Bell aria-hidden="true" />
                    {unreadNotificationCount > 0 ? (
                      <span className="notification-badge" aria-hidden="true">
                        {unreadNotificationCount > 99 ? "99+" : unreadNotificationCount}
                      </span>
                    ) : null}
                  </button>
                </DropdownMenu.Trigger>

                <DropdownMenu.Portal>
                  <DropdownMenu.Content
                    className="notification-menu"
                    sideOffset={10}
                    align="end"
                  >
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
                      <ScrollArea.Root className="notification-scroll-area">
                        <ScrollArea.Viewport className="notification-list">
                          {visibleNotifications.map((notification) => {
                            const unread = !seenNotificationIdSet.has(notification.id);
                            return (
                              <DropdownMenu.Item
                                key={notification.id}
                                className={`notification-item${
                                  unread ? " notification-item-unread" : ""
                                }`}
                                onSelect={() => handleNotificationClick(notification)}
                              >
                                <div className="notification-item-head">
                                  <strong>{notification.title}</strong>
                                  <span>{formatGameDate(notification.gameDateISO)}</span>
                                </div>
                                <p>{notification.message}</p>
                              </DropdownMenu.Item>
                            );
                          })}
                        </ScrollArea.Viewport>
                        <ScrollArea.Scrollbar
                          className="notification-scrollbar"
                          orientation="vertical"
                        >
                          <ScrollArea.Thumb className="notification-scrollbar-thumb" />
                        </ScrollArea.Scrollbar>
                      </ScrollArea.Root>
                    )}
                  </DropdownMenu.Content>
                </DropdownMenu.Portal>
              </DropdownMenu.Root>

              <DropdownMenu.Root>
                <DropdownMenu.Trigger asChild>
                  <button
                    type="button"
                    className="icon-button nav-icon-button profile-avatar-button"
                    aria-label="Profile menu"
                  >
                    <span className="profile-avatar-shell">
                      <span className="profile-avatar">{getProfileInitial()}</span>
                      <span className="profile-status-dot" aria-hidden="true" />
                    </span>
                    {profile ? (
                      <span className="nav-user-copy">
                        <strong>{profile.displayName}</strong>
                        <span>{formatRoleLabel(profile.role)}</span>
                      </span>
                    ) : null}
                    <span className="nav-user-chevron-shell" aria-hidden="true">
                      <ChevronDown className="nav-user-chevron" />
                    </span>
                  </button>
                </DropdownMenu.Trigger>

                <DropdownMenu.Portal>
                  <DropdownMenu.Content className="profile-menu" sideOffset={10} align="end">
                    {profile ? (
                      <div className="profile-menu-header">
                        <div className="profile-menu-header-avatar">{getProfileInitial()}</div>
                        <div className="profile-menu-header-copy">
                          <strong>{profile.displayName}</strong>
                          <span>{profile.email}</span>
                        </div>
                        <span className="profile-menu-role-badge">
                          {formatRoleLabel(profile.role)}
                        </span>
                      </div>
                    ) : null}
                    <DropdownMenu.Item
                      className="profile-menu-item"
                      onSelect={() => navigate("/profile")}
                    >
                      <User aria-hidden="true" />
                      View Profile
                    </DropdownMenu.Item>
                    <DropdownMenu.Item
                      className="profile-menu-item profile-menu-item-danger"
                      onSelect={() => {
                        void handleSignOut();
                      }}
                    >
                      <LogOut aria-hidden="true" />
                      Sign Out
                    </DropdownMenu.Item>
                  </DropdownMenu.Content>
                </DropdownMenu.Portal>
              </DropdownMenu.Root>
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

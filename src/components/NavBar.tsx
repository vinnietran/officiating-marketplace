import { useState } from "react";
import { NavLink } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { MessageModal } from "./MessageModal";

export function NavBar() {
  const { user, profile } = useAuth();
  const [modalMessage, setModalMessage] = useState<{
    title: string;
    message: string;
  } | null>(null);

  return (
    <>
      <nav className="top-nav">
        <div className="top-nav-inner">
          <div className="top-nav-links">
            {user && profile && profile.role !== "official" ? (
              <NavLink
                to="/dashboard"
                className={({ isActive }) => `nav-link${isActive ? " active" : ""}`}
              >
                Dashboard
              </NavLink>
            ) : null}
            <NavLink
              to="/marketplace"
              className={({ isActive }) => `nav-link${isActive ? " active" : ""}`}
            >
              Marketplace
            </NavLink>
            <NavLink
              to="/schedule"
              className={({ isActive }) => `nav-link${isActive ? " active" : ""}`}
            >
              Schedule
            </NavLink>
            {user && profile ? (
              <NavLink
                to="/crews"
                className={({ isActive }) => `nav-link${isActive ? " active" : ""}`}
              >
                Crews
              </NavLink>
            ) : null}
            {user && profile && profile.role !== "official" ? (
              <NavLink
                to="/assign-game"
                className={({ isActive }) => `nav-link${isActive ? " active" : ""}`}
              >
                Assign Game
              </NavLink>
            ) : null}
            {user && profile && profile.role !== "official" ? (
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
              <button
                type="button"
                className="icon-button nav-icon-button"
                aria-label="Notifications"
                onClick={() =>
                  setModalMessage({
                    title: "Notifications",
                    message: "No new notifications."
                  })
                }
              >
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path
                    d="M12 3a5 5 0 0 0-5 5v2.2c0 .7-.2 1.3-.6 1.9L5 14.5V16h14v-1.5l-1.4-2.4a3.8 3.8 0 0 1-.6-1.9V8a5 5 0 0 0-5-5Zm0 18a2.5 2.5 0 0 0 2.4-2h-4.8A2.5 2.5 0 0 0 12 21Z"
                    fill="currentColor"
                  />
                </svg>
              </button>

              <NavLink
                to="/profile"
                className={({ isActive }) =>
                  `icon-button nav-icon-button nav-icon-link${isActive ? " active" : ""}`
                }
                aria-label="Profile"
              >
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path
                    d="M12 12a4.5 4.5 0 1 0-4.5-4.5A4.5 4.5 0 0 0 12 12Zm0 2.2c-3.9 0-7 2.4-7 5.3V21h14v-1.5c0-2.9-3.1-5.3-7-5.3Z"
                    fill="currentColor"
                  />
                </svg>
              </NavLink>
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

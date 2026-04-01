import { useEffect, useState } from "react";
import { CalendarRange, ChevronLeft, ChevronRight } from "lucide-react";
import { Link } from "react-router-dom";
import { AuthPanel } from "../components/AuthPanel";
import { CompleteProfilePanel } from "../components/CompleteProfilePanel";
import { useAuth } from "../context/AuthContext";
import {
  buildAvailabilityCalendarDays,
  formatAvailabilityDate,
  formatAvailabilityMonthLabel,
  getAvailabilityDateKeyFromDate,
  getAvailabilityMonthKeyFromDate,
  normalizeBlockedDateKeys,
  shiftAvailabilityMonthKey
} from "../lib/availability";
import { getUserProfile, updateOfficialProfile } from "../lib/firestore";

export function Availability() {
  const { user, profile, loading, profileLoading } = useAuth();
  const [blockedDateKeys, setBlockedDateKeys] = useState<string[]>([]);
  const [availabilityMonthKey, setAvailabilityMonthKey] = useState(() =>
    getAvailabilityMonthKeyFromDate(new Date())
  );
  const [availabilitySaveError, setAvailabilitySaveError] = useState<string | null>(null);
  const [availabilitySaveSuccess, setAvailabilitySaveSuccess] = useState<string | null>(null);
  const [savingAvailability, setSavingAvailability] = useState(false);

  useEffect(() => {
    if (!profile || profile.role !== "official") {
      setBlockedDateKeys([]);
      return;
    }

    setBlockedDateKeys(profile.availability?.blockedDateKeys ?? []);

    let cancelled = false;

    void getUserProfile(profile.uid)
      .then((freshProfile) => {
        if (cancelled || !freshProfile || freshProfile.role !== "official") {
          return;
        }

        setBlockedDateKeys(freshProfile.availability?.blockedDateKeys ?? []);
      })
      .catch(() => undefined);

    return () => {
      cancelled = true;
    };
  }, [profile]);

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
          <h1>Availability</h1>
          <p>Sign in to manage your availability.</p>
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
          <h1>Availability</h1>
        </header>
        <CompleteProfilePanel />
      </main>
    );
  }

  if (profile.role !== "official") {
    return (
      <main className="page profile-page">
        <section className="profile-dashboard">
          <div className="profile-dashboard-header">
            <div>
              <span className="hero-eyebrow">Availability</span>
              <h1>Official Availability</h1>
              <p>This workspace is only available for officials who need to block assignment dates.</p>
            </div>
            <div className="profile-dashboard-actions">
              <Link to="/profile" className="ui-button ui-button-secondary ui-button-link">
                <CalendarRange />
                Back to Profile
              </Link>
            </div>
          </div>
        </section>
      </main>
    );
  }

  const officialProfile = profile;

  const blockedDateSet = new Set(blockedDateKeys);
  const availabilityCalendarDays = buildAvailabilityCalendarDays(availabilityMonthKey);
  const todayDateKey = getAvailabilityDateKeyFromDate(new Date());
  const blockedDatesThisMonth = availabilityCalendarDays.filter(
    (day) => day.inCurrentMonth && blockedDateSet.has(day.dateKey)
  ).length;
  const nextBlockedDates = blockedDateKeys.filter((dateKey) => dateKey >= todayDateKey).slice(0, 6);

  function handleToggleBlockedDate(dateKey: string) {
    setAvailabilitySaveError(null);
    setAvailabilitySaveSuccess(null);
    setBlockedDateKeys((currentBlockedDateKeys) => {
      if (currentBlockedDateKeys.includes(dateKey)) {
        return currentBlockedDateKeys.filter((currentDateKey) => currentDateKey !== dateKey);
      }

      return normalizeBlockedDateKeys([...currentBlockedDateKeys, dateKey]);
    });
  }

  function handleJumpToCurrentMonth() {
    setAvailabilityMonthKey(getAvailabilityMonthKeyFromDate(new Date()));
  }

  async function handleSaveAvailability() {
    setAvailabilitySaveError(null);
    setAvailabilitySaveSuccess(null);
    setSavingAvailability(true);

    try {
      await updateOfficialProfile(officialProfile.uid, {
        levelsOfficiated: officialProfile.levelsOfficiated ?? [],
        contactInfo: {
          addressLine1: officialProfile.contactInfo?.addressLine1 ?? "",
          addressLine2: officialProfile.contactInfo?.addressLine2 ?? "",
          city: officialProfile.contactInfo?.city ?? "",
          state: officialProfile.contactInfo?.state ?? "",
          postalCode: officialProfile.contactInfo?.postalCode ?? ""
        },
        availability: {
          blockedDateKeys: normalizeBlockedDateKeys(blockedDateKeys)
        }
      });
      setAvailabilitySaveSuccess("Availability saved.");
      setBlockedDateKeys((currentBlockedDateKeys) =>
        normalizeBlockedDateKeys(currentBlockedDateKeys)
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to save availability.";
      setAvailabilitySaveError(message);
    } finally {
      setSavingAvailability(false);
    }
  }

  return (
    <main className="page profile-page">
      <section className="profile-dashboard">
        <div className="profile-dashboard-header">
          <div>
            <span className="hero-eyebrow">Availability</span>
            <h1>Availability Calendar</h1>
            <p>Block off dates so assignors and schools know when you should stay off the board.</p>
          </div>
          <div className="profile-dashboard-actions">
            <span className="hero-badge">{blockedDateKeys.length} blocked dates</span>
            <Link to="/profile" className="ui-button ui-button-secondary ui-button-link">
              <CalendarRange />
              Profile Summary
            </Link>
          </div>
        </div>

        <div className="availability-route-shell">
          <article className="profile-main-card profile-availability-card">
            <div className="profile-card-heading">
              <div>
                <h3>Availability Calendar</h3>
                <p className="meta-line">
                  Click dates to block them out. Assignors and schools will see this when staffing games.
                </p>
              </div>
              <span className="profile-card-chip">{blockedDateKeys.length} blocked</span>
            </div>

            <div className="profile-availability-shell">
              <div className="profile-availability-calendar">
                <div className="profile-availability-toolbar">
                  <button
                    type="button"
                    className="button-secondary profile-availability-nav"
                    onClick={() =>
                      setAvailabilityMonthKey((currentMonthKey) =>
                        shiftAvailabilityMonthKey(currentMonthKey, -1)
                      )
                    }
                    aria-label="Show previous month"
                  >
                    <ChevronLeft />
                  </button>
                  <strong>{formatAvailabilityMonthLabel(availabilityMonthKey)}</strong>
                  <button
                    type="button"
                    className="button-secondary profile-availability-nav"
                    onClick={() =>
                      setAvailabilityMonthKey((currentMonthKey) =>
                        shiftAvailabilityMonthKey(currentMonthKey, 1)
                      )
                    }
                    aria-label="Show next month"
                  >
                    <ChevronRight />
                  </button>
                </div>

                <div className="profile-availability-actions">
                  <button type="button" className="button-secondary" onClick={handleJumpToCurrentMonth}>
                    Today
                  </button>
                </div>

                <div className="profile-availability-weekdays" aria-hidden="true">
                  {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((weekday) => (
                    <span key={weekday}>{weekday}</span>
                  ))}
                </div>

                <div className="profile-availability-grid">
                  {availabilityCalendarDays.map((day) => {
                    const isBlocked = blockedDateSet.has(day.dateKey);
                    return (
                      <button
                        key={day.dateKey}
                        type="button"
                        className={[
                          "profile-availability-day",
                          day.inCurrentMonth ? "" : "profile-availability-day-outside",
                          isBlocked ? "profile-availability-day-blocked" : "",
                          day.isToday ? "profile-availability-day-today" : ""
                        ]
                          .filter(Boolean)
                          .join(" ")}
                        onClick={() => handleToggleBlockedDate(day.dateKey)}
                        aria-pressed={isBlocked}
                        aria-label={`${isBlocked ? "Unblock" : "Block"} ${formatAvailabilityDate(day.dateKey)}`}
                      >
                        <span className="profile-availability-day-number">{day.dayNumber}</span>
                        <span className="profile-availability-day-state">{isBlocked ? "Off" : "Open"}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="profile-availability-summary">
                <div className="profile-availability-kpis">
                  <div>
                    <span>Saved Blocks</span>
                    <strong>{blockedDateKeys.length}</strong>
                  </div>
                  <div>
                    <span>This Month</span>
                    <strong>{blockedDatesThisMonth}</strong>
                  </div>
                  <div>
                    <span>Next Blocked Date</span>
                    <strong>
                      {nextBlockedDates.length > 0 ? formatAvailabilityDate(nextBlockedDates[0]) : "None"}
                    </strong>
                  </div>
                </div>

                <div className="profile-availability-feed">
                  <div className="profile-card-heading">
                    <div>
                      <h4>Upcoming Blocks</h4>
                      <p className="meta-line">The next dates your calendar will hold off the board.</p>
                    </div>
                  </div>

                  {nextBlockedDates.length === 0 ? (
                    <p className="empty-text">No blocked dates scheduled yet.</p>
                  ) : (
                    <div className="profile-availability-list">
                      {nextBlockedDates.map((dateKey) => (
                        <div key={dateKey} className="profile-availability-list-item">
                          <strong>{formatAvailabilityDate(dateKey)}</strong>
                          <button
                            type="button"
                            className="button-secondary"
                            onClick={() => handleToggleBlockedDate(dateKey)}
                          >
                            Reopen
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {availabilitySaveError ? <p className="error-text">{availabilitySaveError}</p> : null}
                {availabilitySaveSuccess ? <p className="hint-text">{availabilitySaveSuccess}</p> : null}

                <div className="profile-actions">
                  <button
                    type="button"
                    onClick={() => void handleSaveAvailability()}
                    disabled={savingAvailability}
                  >
                    {savingAvailability ? "Saving..." : "Save Availability"}
                  </button>
                </div>
              </div>
            </div>
          </article>
        </div>
      </section>
    </main>
  );
}

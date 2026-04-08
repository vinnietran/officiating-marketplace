import { Fragment, useEffect, useMemo, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { CalendarRange, Search, X } from "lucide-react";
import {
  getLocationSuggestions,
  hasGooglePlacesApiKey,
  type PlaceSuggestion
} from "../lib/googlePlaces";
import {
  buildAssignedGameSubmission,
  filterAssignableOfficials,
  getCrewMemberPositionLabel,
  type IndividualAssignee
} from "../lib/assignGame";
import { buildRequestedCrewSizeOptions } from "../lib/crewSize";
import {
  formatAvailabilityDate,
  getAvailabilityDateKeyFromDateTimeLocal,
  isOfficialBlockedOnDateKey
} from "../lib/availability";
import { Button } from "./ui/Button";
import { Select } from "./ui/Select";
import type {
  Crew,
  FootballPosition,
  Level,
  Sport,
  UserProfile
} from "../types";

interface AssignGameFormValues {
  schoolName: string;
  sport: Sport;
  level: Level;
  requestedCrewSize: number;
  dateISO: string;
  scheduledDateKey: string;
  location: string;
  payPosted: number;
  notes?: string;
  directAssignments: Array<
    | {
        assignmentType: "individual";
        officialUid: string;
        officialName: string;
        officialEmail: string;
        position?: FootballPosition;
      }
    | {
        assignmentType: "crew";
        crewId: string;
        crewName: string;
        memberUids: string[];
        memberNames: string[];
      }
  >;
}

interface AssignGameFormProps {
  availableCrews: Crew[];
  availableOfficials: UserProfile[];
  onSubmit: (values: AssignGameFormValues) => Promise<void>;
}

const SPORTS: Sport[] = ["Football", "Basketball", "Soccer", "Baseball"];
const LEVELS: Level[] = [
  "NCAA",
  "Varsity",
  "Junior Varsity",
  "Middle School",
  "Youth"
];
const CREW_SIZE_OPTIONS = buildRequestedCrewSizeOptions();
const FOOTBALL_POSITIONS: Array<{ code: FootballPosition; label: string }> = [
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
const MIN_AUTOCOMPLETE_CHARS = 3;
type AvailabilityFilter = "all" | "available" | "blocked";

export function AssignGameForm({
  availableCrews,
  availableOfficials,
  onSubmit
}: AssignGameFormProps) {
  const [schoolName, setSchoolName] = useState("");
  const [sport, setSport] = useState<Sport>("Football");
  const [level, setLevel] = useState<Level>("Varsity");
  const [requestedCrewSize, setRequestedCrewSize] = useState("");
  const [dateLocal, setDateLocal] = useState("");
  const [location, setLocation] = useState("");
  const [locationSuggestions, setLocationSuggestions] = useState<PlaceSuggestion[]>([]);
  const [locationLookupBusy, setLocationLookupBusy] = useState(false);
  const [locationLookupError, setLocationLookupError] = useState<string | null>(null);
  const [locationFocused, setLocationFocused] = useState(false);
  const [payPosted, setPayPosted] = useState("");
  const [notes, setNotes] = useState("");
  const [officialDirectorySearch, setOfficialDirectorySearch] = useState("");
  const [individualAssignments, setIndividualAssignments] = useState<IndividualAssignee[]>([]);
  const [selectedCrewIds, setSelectedCrewIds] = useState<string[]>([]);
  const [selectedCrewId, setSelectedCrewId] = useState("");
  const [availabilityDialogOpen, setAvailabilityDialogOpen] = useState(false);
  const [availabilityFilter, setAvailabilityFilter] = useState<AvailabilityFilter>("all");
  const [availabilitySearch, setAvailabilitySearch] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const placesEnabled = hasGooglePlacesApiKey();

  const showLocationSuggestions = useMemo(
    () => locationFocused && locationSuggestions.length > 0,
    [locationFocused, locationSuggestions]
  );

  const selectedCrews = useMemo(
    () => availableCrews.filter((crew) => selectedCrewIds.includes(crew.id)),
    [availableCrews, selectedCrewIds]
  );
  const officialProfilesByUid = useMemo(
    () => new Map(availableOfficials.map((official) => [official.uid, official])),
    [availableOfficials]
  );
  const selectableCrews = useMemo(
    () => availableCrews.filter((crew) => !selectedCrewIds.includes(crew.id)),
    [availableCrews, selectedCrewIds]
  );
  const gameDateKey = useMemo(
    () => getAvailabilityDateKeyFromDateTimeLocal(dateLocal),
    [dateLocal]
  );
  const gameDateLabel = gameDateKey ? formatAvailabilityDate(gameDateKey) : "";
  const officialSearchTerm = officialDirectorySearch.trim().toLowerCase();
  const hasOfficialSearch = officialSearchTerm.length > 0;
  const filteredOfficials = useMemo(
    () =>
      hasOfficialSearch
        ? filterAssignableOfficials(availableOfficials, officialDirectorySearch)
        : [],
    [availableOfficials, hasOfficialSearch, officialDirectorySearch]
  );
  const assignmentRosterCount = individualAssignments.length + selectedCrews.length;
  const hasAssignmentRosterEntries = assignmentRosterCount > 0;
  const selectedCrew = useMemo(
    () => availableCrews.find((crew) => crew.id === selectedCrewId) ?? null,
    [availableCrews, selectedCrewId]
  );

  function isOfficialBlockedForGameDate(officialUid: string): boolean {
    const official = officialProfilesByUid.get(officialUid);
    return official ? isOfficialBlockedOnDateKey(official, gameDateKey) : false;
  }

  const selectedCrewUnavailableNames = useMemo(() => {
    if (!selectedCrew || !gameDateKey) {
      return [];
    }

    return selectedCrew.members
      .filter((member) => isOfficialBlockedForGameDate(member.uid))
      .map((member) => member.name);
  }, [gameDateKey, selectedCrew, officialProfilesByUid]);
  const unavailableRosterNames = useMemo(() => {
    if (!gameDateKey) {
      return [];
    }

    const individualNames = individualAssignments
      .filter((assignee) => isOfficialBlockedForGameDate(assignee.officialUid))
      .map((assignee) => assignee.officialName);
    const crewMemberNames = selectedCrews.flatMap((crew) =>
      crew.members.filter((member) => isOfficialBlockedForGameDate(member.uid)).map((member) => member.name)
    );

    return Array.from(new Set([...individualNames, ...crewMemberNames]));
  }, [gameDateKey, individualAssignments, selectedCrews, officialProfilesByUid]);
  const hasUnavailableRosterEntries = unavailableRosterNames.length > 0;
  const availableOfficialCount = useMemo(
    () =>
      availableOfficials.filter((official) => !isOfficialBlockedOnDateKey(official, gameDateKey)).length,
    [availableOfficials, gameDateKey]
  );
  const blockedOfficialCount = availableOfficials.length - availableOfficialCount;
  const filteredAvailabilityOfficials = useMemo(() => {
    const searchTerm = availabilitySearch.trim().toLowerCase();

    return [...availableOfficials]
      .filter((official) => {
        const matchesSearch =
          searchTerm.length === 0 ||
          official.displayName.toLowerCase().includes(searchTerm) ||
          official.email.toLowerCase().includes(searchTerm);
        if (!matchesSearch) {
          return false;
        }

        const isBlocked = isOfficialBlockedOnDateKey(official, gameDateKey);
        if (availabilityFilter === "available") {
          return !isBlocked;
        }
        if (availabilityFilter === "blocked") {
          return isBlocked;
        }
        return true;
      })
      .sort((left, right) => {
        const leftBlocked = isOfficialBlockedOnDateKey(left, gameDateKey);
        const rightBlocked = isOfficialBlockedOnDateKey(right, gameDateKey);
        if (leftBlocked !== rightBlocked) {
          return leftBlocked ? 1 : -1;
        }
        return left.displayName.localeCompare(right.displayName);
      });
  }, [availabilityFilter, availabilitySearch, availableOfficials, gameDateKey]);

  useEffect(() => {
    const trimmedLocation = location.trim();
    if (!placesEnabled || trimmedLocation.length < MIN_AUTOCOMPLETE_CHARS) {
      setLocationSuggestions([]);
      setLocationLookupBusy(false);
      setLocationLookupError(null);
      return;
    }

    let cancelled = false;
    setLocationLookupBusy(true);
    setLocationLookupError(null);

    const timeoutId = window.setTimeout(async () => {
      try {
        const suggestions = await getLocationSuggestions(trimmedLocation);
        if (!cancelled) {
          setLocationSuggestions(suggestions);
        }
      } catch {
        if (!cancelled) {
          setLocationSuggestions([]);
          setLocationLookupError("Unable to load location suggestions.");
        }
      } finally {
        if (!cancelled) {
          setLocationLookupBusy(false);
        }
      }
    }, 250);

    return () => {
      cancelled = true;
      window.clearTimeout(timeoutId);
    };
  }, [location, placesEnabled]);

  useEffect(() => {
    if (sport !== "Football") {
      setIndividualAssignments((current) =>
        current.map((assignee) => ({
          ...assignee,
          position: "ALT"
        }))
      );
    }
  }, [sport]);

  useEffect(() => {
    if (!availabilityDialogOpen) {
      return;
    }

    setAvailabilityFilter("all");
    setAvailabilitySearch("");
  }, [availabilityDialogOpen, gameDateKey]);

  function selectLocationSuggestion(suggestion: PlaceSuggestion) {
    setLocation(suggestion.description);
    setLocationSuggestions([]);
    setLocationLookupError(null);
    setLocationFocused(false);
  }

  function addIndividual(profile: UserProfile) {
    setIndividualAssignments((current) => {
      if (current.some((assignee) => assignee.officialUid === profile.uid)) {
        return current;
      }

      return [
        ...current,
        {
          officialUid: profile.uid,
          officialName: profile.displayName,
          officialEmail: profile.email,
          position: "R"
        }
      ];
    });
  }

  function removeIndividual(officialUid: string) {
    setIndividualAssignments((current) =>
      current.filter((assignee) => assignee.officialUid !== officialUid)
    );
  }

  function updateIndividualPosition(officialUid: string, position: FootballPosition) {
    setIndividualAssignments((current) =>
      current.map((assignee) =>
        assignee.officialUid === officialUid ? { ...assignee, position } : assignee
      )
    );
  }

  function addCrew(crewId: string) {
    if (!crewId) {
      return;
    }

    setSelectedCrewIds((current) =>
      current.includes(crewId) ? current : [...current, crewId]
    );
    setSelectedCrewId("");
  }

  function removeCrew(crewId: string) {
    setSelectedCrewIds((current) => current.filter((id) => id !== crewId));
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    try {
      const submission = buildAssignedGameSubmission({
        schoolName,
        sport,
        level,
        requestedCrewSize,
        dateLocal,
        location,
        payPosted,
        notes,
        individualAssignments,
        selectedCrews
      });

      setSubmitting(true);
      await onSubmit(submission);

      setSchoolName("");
      setSport("Football");
      setLevel("Varsity");
      setRequestedCrewSize("");
      setDateLocal("");
      setLocation("");
      setLocationSuggestions([]);
      setPayPosted("");
      setNotes("");
      setOfficialDirectorySearch("");
      setIndividualAssignments([]);
      setSelectedCrewIds([]);
      setSelectedCrewId("");
    } catch (submitError) {
      const submitMessage =
        submitError instanceof Error ? submitError.message : "Unable to assign game.";
      setError(submitMessage);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section className="post-game-panel post-game-panel-full">
      <div className="form-section-header">
        <span className="hero-eyebrow">Assignment builder</span>
        <h2>Assign Game</h2>
        <p className="meta-line">
          Capture the game details and build the assignment roster before publishing.
        </p>
      </div>
      <form className="post-game-form-grid" onSubmit={handleSubmit}>
        <label>
          School Name
          <input
            type="text"
            value={schoolName}
            onChange={(event) => setSchoolName(event.target.value)}
            required
          />
        </label>

        <label>
          Sport
          <Select
            value={sport}
            onValueChange={(value) => setSport(value)}
            options={SPORTS.map((sportOption) => ({
              value: sportOption,
              label: sportOption
            }))}
          />
        </label>

        <label>
          Level
          <Select
            value={level}
            onValueChange={(value) => setLevel(value)}
            options={LEVELS.map((levelOption) => ({
              value: levelOption,
              label: levelOption
            }))}
          />
        </label>

        <label>
          Crew Size Needed
          <Select
            value={requestedCrewSize}
            onValueChange={setRequestedCrewSize}
            options={CREW_SIZE_OPTIONS}
            placeholder="Select crew size"
          />
        </label>

        <label>
          Date & Time
          <input
            type="datetime-local"
            value={dateLocal}
            onChange={(event) => setDateLocal(event.target.value)}
            required
          />
        </label>

        <label className="location-field">
          Location
          <input
            type="text"
            value={location}
            onChange={(event) => setLocation(event.target.value)}
            onFocus={() => setLocationFocused(true)}
            onBlur={() => {
              window.setTimeout(() => setLocationFocused(false), 160);
            }}
            required
            autoComplete="off"
            placeholder="Start typing an address to use Google Places autocomplete."
            aria-busy={locationLookupBusy}
          />
          {!placesEnabled ? (
            <small className="hint-text">
              Add `VITE_GOOGLE_MAPS_API_KEY` to enable location autocomplete.
            </small>
          ) : null}
          {locationLookupError ? <small className="error-text">{locationLookupError}</small> : null}
          {showLocationSuggestions ? (
            <ul className="location-suggestions">
              {locationSuggestions.map((suggestion) => (
                <li key={suggestion.placeId}>
                  <button
                    type="button"
                    className="location-suggestion-button"
                    onMouseDown={(event) => {
                      event.preventDefault();
                      selectLocationSuggestion(suggestion);
                    }}
                  >
                    {suggestion.description}
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
        </label>

        <label>
          Game Fee (USD)
          <input
            type="number"
            min="1"
            value={payPosted}
            onChange={(event) => setPayPosted(event.target.value)}
            required
          />
        </label>

        <label className="full-width">
          Notes (Optional)
          <textarea
            rows={3}
            maxLength={200}
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
          />
        </label>

        <section className="full-width assign-section">
          <h3>Assign Individuals</h3>
          <div className="assign-search-row">
            <input
              type="text"
              value={officialDirectorySearch}
              onChange={(event) => setOfficialDirectorySearch(event.target.value)}
              placeholder="Search officials by name or email"
            />
            <Button
              type="button"
              variant="secondary"
              className="assign-availability-trigger"
              onClick={() => setAvailabilityDialogOpen(true)}
              disabled={!gameDateKey}
            >
              <CalendarRange />
              Browse Availability
            </Button>
          </div>

          {!gameDateKey ? (
            <p className="hint-text">Set the game date to browse all officials by availability.</p>
          ) : null}

          {!hasOfficialSearch ? (
            <p className="hint-text">Start typing a name or email to search officials.</p>
          ) : filteredOfficials.length > 0 ? (
            <div className="assign-match-list">
              {filteredOfficials.map((match) => {
                const alreadyAdded = individualAssignments.some(
                  (assignee) => assignee.officialUid === match.uid
                );
                const isBlockedForGameDate = gameDateKey
                  ? isOfficialBlockedOnDateKey(match, gameDateKey)
                  : false;

                return (
                  <div key={match.uid} className="assign-match-item">
                    <div>
                      <strong>{match.displayName}</strong>
                      <div className="meta-line">{match.email}</div>
                      <div className="assign-availability-meta">
                        <span
                          className={[
                            "assign-availability-badge",
                            !gameDateKey
                              ? "assign-availability-badge-pending"
                              : isBlockedForGameDate
                                ? "assign-availability-badge-blocked"
                                : "assign-availability-badge-open"
                          ].join(" ")}
                        >
                          {!gameDateKey
                            ? "Set game date"
                            : isBlockedForGameDate
                              ? "Blocked"
                              : "Available"}
                        </span>
                        <span className="meta-line">
                          {!gameDateKey
                            ? "Pick the game date to preview availability."
                            : isBlockedForGameDate
                              ? `Blocked on ${gameDateLabel}`
                              : `Open on ${gameDateLabel}`}
                        </span>
                      </div>
                    </div>
                    <button
                      type="button"
                      className="button-secondary"
                      onClick={() => addIndividual(match)}
                      disabled={alreadyAdded || isBlockedForGameDate}
                    >
                      {alreadyAdded
                        ? "Added"
                        : isBlockedForGameDate
                          ? "Blocked"
                          : "Assign"}
                    </button>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="empty-text">No matching officials found.</p>
          )}
        </section>

        <section className="full-width assign-section">
          <h3>Assign Crews</h3>
          {availableCrews.length === 0 ? (
            <p className="empty-text">No crews available. Create crews from the Crews tab.</p>
          ) : (
            <>
              <div className="assign-search-row">
                <Select
                  value={selectedCrewId}
                  onValueChange={setSelectedCrewId}
                  options={[
                    { value: "", label: "Select a crew" },
                    ...selectableCrews.map((crew) => ({
                      value: crew.id,
                      label: `${crew.name} (${crew.memberUids.length} members)`
                    }))
                  ]}
                />
                <button
                  type="button"
                  className="button-secondary"
                  disabled={!selectedCrewId || selectedCrewUnavailableNames.length > 0}
                  onClick={() => addCrew(selectedCrewId)}
                >
                  Add Crew
                </button>
              </div>

              {selectedCrewId && !gameDateKey ? (
                <p className="hint-text">Choose the game date to preview crew availability.</p>
              ) : null}
              {selectedCrewUnavailableNames.length > 0 ? (
                <p className="error-text">
                  Blocked on {gameDateLabel}: {selectedCrewUnavailableNames.join(", ")}.
                </p>
              ) : null}
              {selectedCrewId && gameDateKey && selectedCrewUnavailableNames.length === 0 ? (
                <p className="hint-text">All crew members are open on {gameDateLabel}.</p>
              ) : null}

              {selectedCrews.length === 0 ? (
                <p className="assign-roster-empty">No crews assigned yet.</p>
              ) : (
                <div className="assign-crew-list">
                  {selectedCrews.map((crew) => (
                    <div key={crew.id} className="assign-match-item">
                      <div>
                        <strong>{crew.name}</strong>
                        <div className="meta-line">{crew.memberUids.length} members</div>
                      </div>
                      <button
                        type="button"
                        className="button-secondary"
                        onClick={() => removeCrew(crew.id)}
                      >
                        Remove
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </section>

        <section className="full-width assign-roster-panel">
          <div className="assign-roster-header">
            <div>
              <h4>Assignment Roster</h4>
              <p className="assign-roster-subtitle">
                Officials and crews added to this assignment
              </p>
            </div>
            <span className="assign-roster-count">{assignmentRosterCount}</span>
          </div>

          {!hasAssignmentRosterEntries ? (
            <p className="assign-roster-empty">No officials or crews assigned yet.</p>
          ) : (
            <>
              {selectedCrews.length > 0 ? (
                <div className="assign-roster-table-wrapper">
                  <table className="assign-roster-table">
                    <thead>
                      <tr>
                        <th>#</th>
                        <th>Crew</th>
                        <th>Members</th>
                        <th>Availability</th>
                        <th>Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {selectedCrews.map((crew, index) => (
                        <Fragment key={crew.id}>
                          <tr>
                            <td>{index + 1}</td>
                            <td>{crew.name}</td>
                            <td>{crew.memberUids.length}</td>
                            <td>
                              {gameDateKey ? (
                                crew.members.some((member) => isOfficialBlockedForGameDate(member.uid)) ? (
                                  <span className="assign-availability-badge assign-availability-badge-blocked">
                                    Blocked members
                                  </span>
                                ) : (
                                  <span className="assign-availability-badge assign-availability-badge-open">
                                    Available
                                  </span>
                                )
                              ) : (
                                <span className="assign-availability-badge assign-availability-badge-pending">
                                  Set game date
                                </span>
                              )}
                            </td>
                            <td>
                              <button
                                type="button"
                                className="button-secondary assign-action-button"
                                onClick={() => removeCrew(crew.id)}
                              >
                                Remove
                              </button>
                            </td>
                          </tr>
                          <tr className="assign-roster-detail-row">
                            <td colSpan={4}>
                              {crew.members.length === 0 ? (
                                <p className="assign-roster-empty">No members found in this crew.</p>
                              ) : (
                                <table className="assign-crew-member-table">
                                  <thead>
                                    <tr>
                                      <th>Name</th>
                                      <th>Position</th>
                                      <th>Availability</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {crew.members.map((member) => (
                                      <tr key={member.uid}>
                                        <td>{member.name}</td>
                                        <td>{getCrewMemberPositionLabel(crew, member.uid)}</td>
                                        <td>
                                          {!gameDateKey ? (
                                            <span className="assign-availability-badge assign-availability-badge-pending">
                                              Set game date
                                            </span>
                                          ) : isOfficialBlockedForGameDate(member.uid) ? (
                                            <span className="assign-availability-badge assign-availability-badge-blocked">
                                              Blocked
                                            </span>
                                          ) : (
                                            <span className="assign-availability-badge assign-availability-badge-open">
                                              Available
                                            </span>
                                          )}
                                        </td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              )}
                            </td>
                          </tr>
                        </Fragment>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : null}

              {individualAssignments.length > 0 ? (
                <div className="assign-roster-table-wrapper">
                  <table className="assign-roster-table">
                    <thead>
                      <tr>
                        <th>#</th>
                        <th>Name</th>
                        <th>Email</th>
                        <th>Availability</th>
                        <th>Position</th>
                        <th>Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {individualAssignments.map((assignee, index) => (
                        <tr key={assignee.officialUid}>
                          <td>{index + 1}</td>
                          <td>{assignee.officialName}</td>
                          <td>{assignee.officialEmail}</td>
                          <td>
                            {!gameDateKey ? (
                              <span className="assign-availability-badge assign-availability-badge-pending">
                                Set game date
                              </span>
                            ) : isOfficialBlockedForGameDate(assignee.officialUid) ? (
                              <span className="assign-availability-badge assign-availability-badge-blocked">
                                Blocked
                              </span>
                            ) : (
                              <span className="assign-availability-badge assign-availability-badge-open">
                                Available
                              </span>
                            )}
                          </td>
                          <td>
                            {sport === "Football" ? (
                              <Select
                                value={assignee.position}
                                onValueChange={(value) =>
                                  updateIndividualPosition(assignee.officialUid, value as FootballPosition)
                                }
                                options={FOOTBALL_POSITIONS.map((position) => ({
                                  value: position.code,
                                  label: position.label
                                }))}
                              />
                            ) : (
                              "N/A"
                            )}
                          </td>
                          <td>
                            <button
                              type="button"
                              className="button-secondary assign-action-button"
                              onClick={() => removeIndividual(assignee.officialUid)}
                            >
                              Remove
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : null}
            </>
          )}
        </section>

        {error ? <p className="error-text full-width">{error}</p> : null}
        {hasUnavailableRosterEntries ? (
          <p className="error-text full-width">
            Blocked on {gameDateLabel}: {unavailableRosterNames.join(", ")}. Remove them from the roster or change the game date.
          </p>
        ) : null}

        <div className="full-width post-game-submit-row">
          <button type="submit" disabled={submitting || hasUnavailableRosterEntries}>
            {submitting ? "Assigning..." : "Assign Game"}
          </button>
        </div>
      </form>

      <Dialog.Root open={availabilityDialogOpen} onOpenChange={setAvailabilityDialogOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className="rating-studio-overlay" />
          <Dialog.Content className="assign-availability-dialog">
            <div className="assign-availability-dialog-head">
              <div>
                <Dialog.Title className="assign-availability-dialog-title">
                  Availability Finder
                </Dialog.Title>
                <Dialog.Description className="assign-availability-dialog-description">
                  Review every official against {gameDateLabel || "the selected game date"} and add available officials directly to the roster.
                </Dialog.Description>
              </div>
              <Dialog.Close asChild>
                <button
                  type="button"
                  className="rating-studio-close"
                  aria-label="Close availability finder"
                >
                  <X />
                </button>
              </Dialog.Close>
            </div>

            <div className="assign-availability-dialog-kpis">
              <article className="assign-availability-kpi">
                <span>Game date</span>
                <strong>{gameDateLabel || "Choose a date first"}</strong>
              </article>
              <article className="assign-availability-kpi">
                <span>Available</span>
                <strong>{availableOfficialCount}</strong>
              </article>
              <article className="assign-availability-kpi">
                <span>Blocked</span>
                <strong>{blockedOfficialCount}</strong>
              </article>
            </div>

            <div className="assign-availability-dialog-toolbar">
              <label className="assign-availability-search">
                <Search />
                <input
                  type="text"
                  value={availabilitySearch}
                  onChange={(event) => setAvailabilitySearch(event.target.value)}
                  placeholder="Search all officials by name or email"
                />
              </label>

              <div className="assign-availability-filter-group" role="tablist" aria-label="Availability filter">
                {[
                  { value: "all", label: "All" },
                  { value: "available", label: "Available" },
                  { value: "blocked", label: "Blocked" }
                ].map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    className={`assign-availability-filter${
                      availabilityFilter === option.value ? " assign-availability-filter-active" : ""
                    }`}
                    onClick={() => setAvailabilityFilter(option.value as AvailabilityFilter)}
                    aria-pressed={availabilityFilter === option.value}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="assign-availability-dialog-list">
              {filteredAvailabilityOfficials.length === 0 ? (
                <p className="empty-text">No officials match that filter.</p>
              ) : (
                filteredAvailabilityOfficials.map((official) => {
                  const alreadyAdded = individualAssignments.some(
                    (assignee) => assignee.officialUid === official.uid
                  );
                  const isBlocked = isOfficialBlockedOnDateKey(official, gameDateKey);

                  return (
                    <article key={official.uid} className="assign-availability-dialog-item">
                      <div className="assign-availability-dialog-copy">
                        <div className="assign-availability-dialog-name-row">
                          <strong>{official.displayName}</strong>
                          <span
                            className={`assign-availability-badge ${
                              isBlocked
                                ? "assign-availability-badge-blocked"
                                : "assign-availability-badge-open"
                            }`}
                          >
                            {isBlocked ? "Blocked" : "Available"}
                          </span>
                        </div>
                        <span>{official.email}</span>
                        <span>
                          {isBlocked
                            ? `Unavailable on ${gameDateLabel}`
                            : `Open on ${gameDateLabel}`}
                        </span>
                      </div>
                      <Button
                        type="button"
                        variant="secondary"
                        onClick={() => addIndividual(official)}
                        disabled={alreadyAdded || isBlocked}
                      >
                        {alreadyAdded ? "Added" : isBlocked ? "Blocked" : "Add to Roster"}
                      </Button>
                    </article>
                  );
                })
              )}
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </section>
  );
}

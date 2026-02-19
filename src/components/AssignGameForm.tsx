import { Fragment, useEffect, useMemo, useState } from "react";
import {
  getLocationSuggestions,
  hasGooglePlacesApiKey,
  type PlaceSuggestion
} from "../lib/googlePlaces";
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
  dateISO: string;
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

interface IndividualAssignee {
  officialUid: string;
  officialName: string;
  officialEmail: string;
  position: FootballPosition;
}

const SPORTS: Sport[] = ["Football", "Basketball", "Soccer", "Baseball"];
const LEVELS: Level[] = [
  "NCAA",
  "Varsity",
  "Junior Varsity",
  "Middle School",
  "Youth"
];
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
const FOOTBALL_POSITION_LABEL_BY_CODE: Record<FootballPosition, string> = FOOTBALL_POSITIONS.reduce(
  (acc, position) => {
    acc[position.code] = position.label;
    return acc;
  },
  {} as Record<FootballPosition, string>
);
const MIN_AUTOCOMPLETE_CHARS = 3;

export function AssignGameForm({
  availableCrews,
  availableOfficials,
  onSubmit
}: AssignGameFormProps) {
  const [schoolName, setSchoolName] = useState("");
  const [sport, setSport] = useState<Sport>("Football");
  const [level, setLevel] = useState<Level>("Varsity");
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
  const selectableCrews = useMemo(
    () => availableCrews.filter((crew) => !selectedCrewIds.includes(crew.id)),
    [availableCrews, selectedCrewIds]
  );
  const officialSearchTerm = officialDirectorySearch.trim().toLowerCase();
  const hasOfficialSearch = officialSearchTerm.length > 0;
  const filteredOfficials = useMemo(() => {
    if (!hasOfficialSearch) {
      return [];
    }
    return availableOfficials
      .filter(
        (official) =>
          official.displayName.toLowerCase().includes(officialSearchTerm) ||
          official.email.toLowerCase().includes(officialSearchTerm)
      )
      .slice(0, 30);
  }, [availableOfficials, hasOfficialSearch, officialSearchTerm]);
  const assignmentRosterCount = individualAssignments.length + selectedCrews.length;
  const hasAssignmentRosterEntries = assignmentRosterCount > 0;

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

  function getCrewMemberPositionLabel(crew: Crew, memberUid: string): string {
    const positionCode = crew.memberPositions[memberUid];
    if (!positionCode) {
      return "Unassigned";
    }

    return FOOTBALL_POSITION_LABEL_BY_CODE[positionCode] ?? positionCode;
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    const parsedPay = Number(payPosted);
    const date = new Date(dateLocal);

    if (!schoolName.trim() || !location.trim()) {
      setError("School and location are required.");
      return;
    }

    if (!dateLocal || Number.isNaN(date.getTime())) {
      setError("A valid game date and time is required.");
      return;
    }

    if (!Number.isFinite(parsedPay) || parsedPay <= 0) {
      setError("Game fee must be greater than 0.");
      return;
    }

    if (individualAssignments.length === 0 && selectedCrews.length === 0) {
      setError("Add at least one individual or one crew.");
      return;
    }

    if (sport === "Football") {
      const missingPosition = individualAssignments.some((assignee) => !assignee.position);
      if (missingPosition) {
        setError("Each football official assignment requires a position.");
        return;
      }
    }

    try {
      setSubmitting(true);
      await onSubmit({
        schoolName: schoolName.trim(),
        sport,
        level,
        dateISO: date.toISOString(),
        location: location.trim(),
        payPosted: parsedPay,
        notes: notes.trim() || undefined,
        directAssignments: [
          ...individualAssignments.map((assignee) => ({
            assignmentType: "individual" as const,
            officialUid: assignee.officialUid,
            officialName: assignee.officialName,
            officialEmail: assignee.officialEmail,
            ...(sport === "Football" ? { position: assignee.position } : {})
          })),
          ...selectedCrews.map((crew) => ({
            assignmentType: "crew" as const,
            crewId: crew.id,
            crewName: crew.name,
            memberUids: crew.memberUids,
            memberNames: crew.members.map((member) => member.name)
          }))
        ]
      });

      setSchoolName("");
      setSport("Football");
      setLevel("Varsity");
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
      <h2>Assign Game</h2>
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
          <select value={sport} onChange={(event) => setSport(event.target.value as Sport)}>
            {SPORTS.map((sportOption) => (
              <option key={sportOption} value={sportOption}>
                {sportOption}
              </option>
            ))}
          </select>
        </label>

        <label>
          Level
          <select value={level} onChange={(event) => setLevel(event.target.value as Level)}>
            {LEVELS.map((levelOption) => (
              <option key={levelOption} value={levelOption}>
                {levelOption}
              </option>
            ))}
          </select>
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
          </div>

          {!hasOfficialSearch ? (
            <p className="hint-text">Start typing a name or email to search officials.</p>
          ) : filteredOfficials.length > 0 ? (
            <div className="assign-match-list">
              {filteredOfficials.map((match) => {
                const alreadyAdded = individualAssignments.some(
                  (assignee) => assignee.officialUid === match.uid
                );

                return (
                  <div key={match.uid} className="assign-match-item">
                    <div>
                      <strong>{match.displayName}</strong>
                      <div className="meta-line">{match.email}</div>
                    </div>
                    <button
                      type="button"
                      className="button-secondary"
                      onClick={() => addIndividual(match)}
                      disabled={alreadyAdded}
                    >
                      {alreadyAdded ? "Added" : "Assign"}
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
                <select
                  value={selectedCrewId}
                  onChange={(event) => setSelectedCrewId(event.target.value)}
                >
                  <option value="">Select a crew</option>
                  {selectableCrews.map((crew) => (
                    <option key={crew.id} value={crew.id}>
                      {crew.name} ({crew.memberUids.length} members)
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  className="button-secondary"
                  disabled={!selectedCrewId}
                  onClick={() => addCrew(selectedCrewId)}
                >
                  Add Crew
                </button>
              </div>

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
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {crew.members.map((member) => (
                                      <tr key={member.uid}>
                                        <td>{member.name}</td>
                                        <td>{getCrewMemberPositionLabel(crew, member.uid)}</td>
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
                            {sport === "Football" ? (
                              <select
                                value={assignee.position}
                                onChange={(event) =>
                                  updateIndividualPosition(
                                    assignee.officialUid,
                                    event.target.value as FootballPosition
                                  )
                                }
                              >
                                {FOOTBALL_POSITIONS.map((position) => (
                                  <option key={position.code} value={position.code}>
                                    {position.label}
                                  </option>
                                ))}
                              </select>
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

        <div className="full-width post-game-submit-row">
          <button type="submit" disabled={submitting}>
            {submitting ? "Assigning..." : "Assign Game"}
          </button>
        </div>
      </form>
    </section>
  );
}

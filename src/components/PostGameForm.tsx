import { useEffect, useMemo, useState } from "react";
import {
  getLocationSuggestions,
  hasGooglePlacesApiKey,
  type PlaceSuggestion
} from "../lib/googlePlaces";
import type { Level, Sport } from "../types";

interface PostGameFormValues {
  schoolName: string;
  sport: Sport;
  level: Level;
  dateISO: string;
  acceptingBidsUntilISO?: string;
  location: string;
  payPosted: number;
  notes?: string;
}

interface PostGameFormProps {
  onSubmit: (values: PostGameFormValues) => Promise<void>;
}

const SPORTS: Sport[] = ["Football", "Basketball", "Soccer", "Baseball"];
const LEVELS: Level[] = [
  "NCAA",
  "Varsity",
  "Junior Varsity",
  "Middle School",
  "Youth"
];
const MIN_AUTOCOMPLETE_CHARS = 3;

export function PostGameForm({ onSubmit }: PostGameFormProps) {
  const [schoolName, setSchoolName] = useState("");
  const [sport, setSport] = useState<Sport>("Football");
  const [level, setLevel] = useState<Level>("Varsity");
  const [dateLocal, setDateLocal] = useState("");
  const [acceptingBidsUntilLocal, setAcceptingBidsUntilLocal] = useState("");
  const [location, setLocation] = useState("");
  const [locationSuggestions, setLocationSuggestions] = useState<PlaceSuggestion[]>([]);
  const [locationLookupBusy, setLocationLookupBusy] = useState(false);
  const [locationLookupError, setLocationLookupError] = useState<string | null>(null);
  const [locationFocused, setLocationFocused] = useState(false);
  const [payPosted, setPayPosted] = useState("");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const placesEnabled = hasGooglePlacesApiKey();

  const showLocationSuggestions = useMemo(
    () => locationFocused && locationSuggestions.length > 0,
    [locationFocused, locationSuggestions]
  );

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

  function selectLocationSuggestion(suggestion: PlaceSuggestion) {
    setLocation(suggestion.description);
    setLocationSuggestions([]);
    setLocationLookupError(null);
    setLocationFocused(false);
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    const parsedPay = Number(payPosted);
    const date = new Date(dateLocal);
    const acceptingBidsUntil = acceptingBidsUntilLocal
      ? new Date(acceptingBidsUntilLocal)
      : null;

    if (!schoolName.trim() || !location.trim()) {
      setError("School and location are required.");
      return;
    }

    if (!dateLocal || Number.isNaN(date.getTime())) {
      setError("A valid game date and time is required.");
      return;
    }

    if (
      acceptingBidsUntil &&
      (Number.isNaN(acceptingBidsUntil.getTime()) ||
        acceptingBidsUntil.getTime() > date.getTime())
    ) {
      setError("Accepting bids until must be a valid date/time before game start.");
      return;
    }

    if (!Number.isFinite(parsedPay) || parsedPay <= 0) {
      setError("Posted pay must be greater than 0.");
      return;
    }

    try {
      setSubmitting(true);
      await onSubmit({
        schoolName: schoolName.trim(),
        sport,
        level,
        dateISO: date.toISOString(),
        acceptingBidsUntilISO: acceptingBidsUntil
          ? acceptingBidsUntil.toISOString()
          : undefined,
        location: location.trim(),
        payPosted: parsedPay,
        notes: notes.trim() || undefined
      });

      setSchoolName("");
      setSport("Football");
      setLevel("Varsity");
      setDateLocal("");
      setAcceptingBidsUntilLocal("");
      setLocation("");
      setLocationSuggestions([]);
      setPayPosted("");
      setNotes("");
    } catch (submitError) {
      const submitMessage =
        submitError instanceof Error ? submitError.message : "Unable to post game.";
      setError(submitMessage);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section className="post-game-panel post-game-panel-full">
      <h2>Create Assignment</h2>
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
          <select
            value={sport}
            onChange={(event) => setSport(event.target.value as Sport)}
          >
            {SPORTS.map((sportOption) => (
              <option key={sportOption} value={sportOption}>
                {sportOption}
              </option>
            ))}
          </select>
        </label>

        <label>
          Level
          <select
            value={level}
            onChange={(event) => setLevel(event.target.value as Level)}
          >
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

        <label>
          Accepting Bids Until
          <input
            type="datetime-local"
            value={acceptingBidsUntilLocal}
            onChange={(event) => setAcceptingBidsUntilLocal(event.target.value)}
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
          Posted Pay (USD)
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

        {error ? <p className="error-text full-width">{error}</p> : null}

        <div className="full-width post-game-submit-row">
          <button type="submit" disabled={submitting}>
            {submitting ? "Posting..." : "Post Game"}
          </button>
        </div>
      </form>
    </section>
  );
}

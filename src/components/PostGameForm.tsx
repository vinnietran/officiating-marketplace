import { useEffect, useMemo, useState } from "react";
import {
  getLocationSuggestions,
  hasGooglePlacesApiKey,
  type PlaceSuggestion
} from "../lib/googlePlaces";
import { buildMarketplaceGameSubmission } from "../lib/gameForms";
import { getBidRangeFormErrors } from "../lib/bidRange";
import { buildRequestedCrewSizeOptions } from "../lib/crewSize";
import type { Level, Sport } from "../types";
import { Select } from "./ui/Select";

interface PostGameFormValues {
  schoolName: string;
  sport: Sport;
  level: Level;
  requestedCrewSize: number;
  dateISO: string;
  scheduledDateKey: string;
  acceptingBidsUntilISO?: string;
  location: string;
  payPosted: number;
  minBidAmount?: number;
  maxBidAmount?: number;
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
const CREW_SIZE_OPTIONS = buildRequestedCrewSizeOptions();
const MIN_AUTOCOMPLETE_CHARS = 3;

export function PostGameForm({ onSubmit }: PostGameFormProps) {
  const [schoolName, setSchoolName] = useState("");
  const [sport, setSport] = useState<Sport>("Football");
  const [level, setLevel] = useState<Level>("Varsity");
  const [requestedCrewSize, setRequestedCrewSize] = useState("");
  const [dateLocal, setDateLocal] = useState("");
  const [acceptingBidsUntilLocal, setAcceptingBidsUntilLocal] = useState("");
  const [location, setLocation] = useState("");
  const [locationSuggestions, setLocationSuggestions] = useState<PlaceSuggestion[]>([]);
  const [locationLookupBusy, setLocationLookupBusy] = useState(false);
  const [locationLookupError, setLocationLookupError] = useState<string | null>(null);
  const [locationFocused, setLocationFocused] = useState(false);
  const [payPosted, setPayPosted] = useState("");
  const [minBidAmount, setMinBidAmount] = useState("");
  const [maxBidAmount, setMaxBidAmount] = useState("");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const placesEnabled = hasGooglePlacesApiKey();
  const bidRangeErrors = useMemo(
    () => getBidRangeFormErrors({ minBidAmount, maxBidAmount }),
    [maxBidAmount, minBidAmount]
  );

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

    try {
      const submission = buildMarketplaceGameSubmission({
        schoolName,
        sport,
        level,
        requestedCrewSize,
        dateLocal,
        acceptingBidsUntilLocal,
        location,
        payPosted,
        minBidAmount,
        maxBidAmount,
        notes
      });

      setSubmitting(true);
      await onSubmit(submission);

      setSchoolName("");
      setSport("Football");
      setLevel("Varsity");
      setRequestedCrewSize("");
      setDateLocal("");
      setAcceptingBidsUntilLocal("");
      setLocation("");
      setLocationSuggestions([]);
      setPayPosted("");
      setMinBidAmount("");
      setMaxBidAmount("");
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
      <div className="form-section-header">
        <span className="hero-eyebrow">Listing builder</span>
        <h2>Create Assignment</h2>
        <p className="meta-line">
          Provide complete game details so officials can evaluate the opportunity quickly.
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
          <small className="hint-text">
            Set how many officials you want the crew to fill for this game.
          </small>
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
            step="1"
            value={payPosted}
            onChange={(event) => setPayPosted(event.target.value)}
            required
          />
        </label>

        <label>
          Minimum Preferred Bid
          <input
            type="number"
            min="0"
            step="1"
            value={minBidAmount}
            onChange={(event) => setMinBidAmount(event.target.value)}
            aria-invalid={Boolean(bidRangeErrors.minBidAmount)}
          />
          <small className="hint-text">
            Set the range you expect bidders to offer for this game.
          </small>
          {bidRangeErrors.minBidAmount ? (
            <small className="error-text">{bidRangeErrors.minBidAmount}</small>
          ) : null}
        </label>

        <label>
          Maximum Preferred Bid
          <input
            type="number"
            min="1"
            step="1"
            value={maxBidAmount}
            onChange={(event) => setMaxBidAmount(event.target.value)}
            aria-invalid={Boolean(bidRangeErrors.maxBidAmount)}
          />
          <small className="hint-text">
            Leave both preferred bid fields blank to keep bidding open-ended.
          </small>
          {bidRangeErrors.maxBidAmount ? (
            <small className="error-text">{bidRangeErrors.maxBidAmount}</small>
          ) : null}
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

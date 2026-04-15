import { useState } from "react";
import { buildMarketplaceGameSubmission, toDateTimeLocalValue } from "../lib/gameForms";
import { getBidRangeFormErrors } from "../lib/bidRange";
import { buildRequestedCrewSizeOptions } from "../lib/crewSize";
import type { Game, Level, Sport } from "../types";
import { Select } from "./ui/Select";

interface EditGameFormValues {
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

interface EditGameFormProps {
  game: Game;
  onSubmit: (values: EditGameFormValues) => Promise<void>;
  onCancel: () => void;
}

const SPORTS: Sport[] = ["Football", "Basketball", "Soccer", "Baseball"];
const LEVELS: Level[] = ["NCAA", "Varsity", "Junior Varsity", "Middle School", "Youth"];
const CREW_SIZE_OPTIONS = buildRequestedCrewSizeOptions();

export function EditGameForm({ game, onSubmit, onCancel }: EditGameFormProps) {
  const [schoolName, setSchoolName] = useState(game.schoolName);
  const [sport, setSport] = useState<Sport>(game.sport);
  const [level, setLevel] = useState<Level>(game.level);
  const [requestedCrewSize, setRequestedCrewSize] = useState(
    game.requestedCrewSize ? String(game.requestedCrewSize) : ""
  );
  const [dateLocal, setDateLocal] = useState(toDateTimeLocalValue(game.dateISO));
  const [acceptingBidsUntilLocal, setAcceptingBidsUntilLocal] = useState(
    toDateTimeLocalValue(game.acceptingBidsUntilISO)
  );
  const [location, setLocation] = useState(game.location);
  const [payPosted, setPayPosted] = useState(String(game.payPosted));
  const [minBidAmount, setMinBidAmount] = useState(
    typeof game.minBidAmount === "number" ? String(game.minBidAmount) : ""
  );
  const [maxBidAmount, setMaxBidAmount] = useState(
    typeof game.maxBidAmount === "number" ? String(game.maxBidAmount) : ""
  );
  const [notes, setNotes] = useState(game.notes ?? "");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const bidRangeErrors = getBidRangeFormErrors({ minBidAmount, maxBidAmount });

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

      setSaving(true);
      await onSubmit(submission);
    } catch (submitError) {
      const submitMessage =
        submitError instanceof Error ? submitError.message : "Unable to save game updates.";
      setError(submitMessage);
    } finally {
      setSaving(false);
    }
  }

  return (
    <form className="bid-form" onSubmit={handleSubmit}>
      <h4>Edit Posted Game</h4>

      <div className="filters-grid">
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

        <label>
          Accepting Bids Until
          <input
            type="datetime-local"
            value={acceptingBidsUntilLocal}
            onChange={(event) => setAcceptingBidsUntilLocal(event.target.value)}
          />
        </label>

        <label>
          Location
          <input
            type="text"
            value={location}
            onChange={(event) => setLocation(event.target.value)}
            required
          />
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
      </div>

      {error ? <p className="error-text">{error}</p> : null}

      <div className="bid-form-actions">
        <button type="submit" disabled={saving}>
          {saving ? "Saving..." : "Save Changes"}
        </button>
        <button type="button" className="button-secondary" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </form>
  );
}

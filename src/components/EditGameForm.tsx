import { useState } from "react";
import type { Game, Level, Sport } from "../types";

interface EditGameFormValues {
  schoolName: string;
  sport: Sport;
  level: Level;
  dateISO: string;
  acceptingBidsUntilISO?: string;
  location: string;
  payPosted: number;
  notes?: string;
}

interface EditGameFormProps {
  game: Game;
  onSubmit: (values: EditGameFormValues) => Promise<void>;
  onCancel: () => void;
}

const SPORTS: Sport[] = ["Football", "Basketball", "Soccer", "Baseball"];
const LEVELS: Level[] = [
  "NCAA",
  "Varsity",
  "Junior Varsity",
  "Middle School",
  "Youth"
];

function toDateTimeLocalValue(dateISO?: string): string {
  if (!dateISO) {
    return "";
  }

  const date = new Date(dateISO);
  if (Number.isNaN(date.getTime())) {
    return "";
  }

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");

  return `${year}-${month}-${day}T${hours}:${minutes}`;
}

export function EditGameForm({ game, onSubmit, onCancel }: EditGameFormProps) {
  const [schoolName, setSchoolName] = useState(game.schoolName);
  const [sport, setSport] = useState<Sport>(game.sport);
  const [level, setLevel] = useState<Level>(game.level);
  const [dateLocal, setDateLocal] = useState(toDateTimeLocalValue(game.dateISO));
  const [acceptingBidsUntilLocal, setAcceptingBidsUntilLocal] = useState(
    toDateTimeLocalValue(game.acceptingBidsUntilISO)
  );
  const [location, setLocation] = useState(game.location);
  const [payPosted, setPayPosted] = useState(String(game.payPosted));
  const [notes, setNotes] = useState(game.notes ?? "");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    const parsedPay = Number(payPosted);
    const gameDate = new Date(dateLocal);
    const bidsUntilDate = acceptingBidsUntilLocal
      ? new Date(acceptingBidsUntilLocal)
      : null;

    if (!schoolName.trim() || !location.trim()) {
      setError("School and location are required.");
      return;
    }

    if (!dateLocal || Number.isNaN(gameDate.getTime())) {
      setError("A valid game date and time is required.");
      return;
    }

    if (
      bidsUntilDate &&
      (Number.isNaN(bidsUntilDate.getTime()) ||
        bidsUntilDate.getTime() > gameDate.getTime())
    ) {
      setError("Accepting bids until must be a valid date/time before game start.");
      return;
    }

    if (!Number.isFinite(parsedPay) || parsedPay <= 0) {
      setError("Posted pay must be greater than 0.");
      return;
    }

    try {
      setSaving(true);
      await onSubmit({
        schoolName: schoolName.trim(),
        sport,
        level,
        dateISO: gameDate.toISOString(),
        acceptingBidsUntilISO: bidsUntilDate ? bidsUntilDate.toISOString() : undefined,
        location: location.trim(),
        payPosted: parsedPay,
        notes: notes.trim() || undefined
      });
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

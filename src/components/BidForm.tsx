import { useEffect, useMemo, useState } from "react";
import type { Bid, Crew } from "../types";

interface BidFormValues {
  officialName: string;
  bidderType: "individual" | "crew";
  crewId?: string;
  crewName?: string;
  amount: number;
  message?: string;
}

interface BidFormProps {
  postedPay: number;
  defaultOfficialName: string;
  availableCrews: Crew[];
  existingBids: Bid[];
  singleBidMode?: boolean;
  forceCrewOnly?: boolean;
  onSubmit: (values: BidFormValues) => Promise<void>;
  onCancel: () => void;
}

export function BidForm({
  postedPay,
  defaultOfficialName,
  availableCrews,
  existingBids,
  singleBidMode = false,
  forceCrewOnly = false,
  onSubmit,
  onCancel
}: BidFormProps) {
  const [officialName, setOfficialName] = useState(defaultOfficialName);
  const [bidderType, setBidderType] = useState<"individual" | "crew">("individual");
  const [selectedCrewId, setSelectedCrewId] = useState(availableCrews[0]?.id ?? "");
  const [amount, setAmount] = useState(String(postedPay));
  const [message, setMessage] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    setOfficialName(defaultOfficialName);
  }, [defaultOfficialName]);

  useEffect(() => {
    if (availableCrews.length === 0) {
      setBidderType(forceCrewOnly ? "crew" : "individual");
      setSelectedCrewId("");
      return;
    }

    setSelectedCrewId((current) => {
      if (availableCrews.some((crew) => crew.id === current)) {
        return current;
      }
      return availableCrews[0].id;
    });
  }, [availableCrews, forceCrewOnly]);

  useEffect(() => {
    if (forceCrewOnly && bidderType !== "crew") {
      setBidderType("crew");
    }
  }, [bidderType, forceCrewOnly]);

  const individualBid = useMemo(
    () =>
      existingBids.find(
        (bid) => !bid.bidderType || bid.bidderType === "individual"
      ) ?? null,
    [existingBids]
  );

  const crewBidsByCrewId = useMemo(() => {
    const result = new Map<string, Bid>();
    existingBids.forEach((bid) => {
      if (bid.bidderType === "crew" && bid.crewId && !result.has(bid.crewId)) {
        result.set(bid.crewId, bid);
      }
    });
    return result;
  }, [existingBids]);

  const activeCrew = useMemo(
    () => availableCrews.find((crew) => crew.id === selectedCrewId) ?? null,
    [availableCrews, selectedCrewId]
  );

  const latestExistingBid = useMemo(
    () => [...existingBids].sort((a, b) => b.createdAtISO.localeCompare(a.createdAtISO))[0] ?? null,
    [existingBids]
  );

  const activeBid = singleBidMode
    ? latestExistingBid
    : bidderType === "crew"
      ? crewBidsByCrewId.get(selectedCrewId) ?? null
      : individualBid;

  useEffect(() => {
    if (activeBid) {
      setAmount(String(Math.max(activeBid.amount + 1, postedPay)));
      setMessage(activeBid.message ?? "");
      return;
    }

    setAmount(String(postedPay));
    setMessage("");
  }, [activeBid, postedPay]);

  const trimmedName = useMemo(() => officialName.trim(), [officialName]);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const numericAmount = Number(amount);

    if (!trimmedName) {
      setError("Official name is required.");
      return;
    }

    if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
      setError("Bid amount must be greater than 0.");
      return;
    }

    if (message.length > 200) {
      setError("Message cannot exceed 200 characters.");
      return;
    }

    if (bidderType === "crew" && !selectedCrewId) {
      setError("Select a crew to submit a crew bid.");
      return;
    }

    if (activeBid && numericAmount <= activeBid.amount) {
      setError("New offer must be higher than your current bid.");
      return;
    }

    try {
      setSubmitting(true);
      setError(null);
      await onSubmit({
        officialName: trimmedName,
        bidderType,
        crewId: bidderType === "crew" ? selectedCrewId : undefined,
        crewName: bidderType === "crew" ? activeCrew?.name : undefined,
        amount: numericAmount,
        message: message.trim() || undefined
      });
    } catch (submitError) {
      const submitMessage =
        submitError instanceof Error ? submitError.message : "Unable to submit bid.";
      setError(submitMessage);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form className="bid-form" onSubmit={handleSubmit}>
      <h4>{activeBid ? "Update Your Bid" : "Place Your Bid"}</h4>

      {availableCrews.length > 0 ? (
        <>
          <label>
            Bid As
            <select
              value={bidderType}
              onChange={(event) =>
                setBidderType(event.target.value as "individual" | "crew")
              }
              disabled={forceCrewOnly}
            >
              {!forceCrewOnly ? <option value="individual">Individual</option> : null}
              <option value="crew">Crew</option>
            </select>
          </label>

          {bidderType === "crew" ? (
            <label>
              Crew
              <select
                value={selectedCrewId}
                onChange={(event) => setSelectedCrewId(event.target.value)}
              >
                {availableCrews.map((crew) => (
                  <option key={crew.id} value={crew.id}>
                    {crew.name}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
        </>
      ) : null}

      {forceCrewOnly ? (
        <p className="hint-text">Varsity games require a crew bid.</p>
      ) : null}

      <label>
        Official Name
        <input
          type="text"
          value={officialName}
          onChange={(event) => setOfficialName(event.target.value)}
          required
        />
      </label>

      <label>
        Bid Amount (USD)
        <input
          type="number"
          min="1"
          step="1"
          value={amount}
          onChange={(event) => setAmount(event.target.value)}
          required
        />
      </label>

      <label>
        Message (Optional)
        <textarea
          maxLength={200}
          rows={3}
          value={message}
          onChange={(event) => setMessage(event.target.value)}
          placeholder="Any note for the school..."
        />
      </label>

      <small>{message.length}/200 characters</small>

      {activeBid ? (
        <p className="hint-text">
          Current offer for this game:{" "}
          <strong>${activeBid.amount}</strong>
        </p>
      ) : null}

      {error ? <p className="error-text">{error}</p> : null}

      <div className="bid-form-actions">
        <button type="submit" disabled={submitting}>
          {submitting
            ? "Submitting..."
            : activeBid
              ? "Update Bid"
              : "Place Bid"}
        </button>
        <button type="button" className="button-secondary" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </form>
  );
}

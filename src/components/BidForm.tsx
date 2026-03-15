import { useEffect, useMemo, useState } from "react";
import { buildBidSubmission, findActiveBid, getBidFormDefaults } from "../lib/bids";
import type { Bid, Crew } from "../types";
import { Select } from "./ui/Select";

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

  const activeCrew = useMemo(
    () => availableCrews.find((crew) => crew.id === selectedCrewId) ?? null,
    [availableCrews, selectedCrewId]
  );
  const activeBid = useMemo(
    () =>
      findActiveBid({
        bidderType,
        existingBids,
        selectedCrewId,
        singleBidMode
      }),
    [bidderType, existingBids, selectedCrewId, singleBidMode]
  );

  useEffect(() => {
    const defaults = getBidFormDefaults(postedPay, activeBid);
    setAmount(defaults.amount);
    setMessage(defaults.message);
  }, [activeBid, postedPay]);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    try {
      const submission = buildBidSubmission({
        officialName,
        bidderType,
        selectedCrewId,
        amount,
        message,
        activeBid,
        availableCrews
      });

      setSubmitting(true);
      setError(null);
      await onSubmit({
        ...submission,
        crewName: bidderType === "crew" ? activeCrew?.name ?? submission.crewName : undefined
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
            <Select
              value={bidderType}
              onValueChange={(value) => setBidderType(value)}
              disabled={forceCrewOnly}
              options={[
                ...(!forceCrewOnly
                  ? [{ value: "individual" as const, label: "Individual" }]
                  : []),
                { value: "crew" as const, label: "Crew" }
              ]}
            />
          </label>

          {bidderType === "crew" ? (
            <label>
              Crew
              <Select
                value={selectedCrewId}
                onValueChange={setSelectedCrewId}
                options={availableCrews.map((crew) => ({
                  value: crew.id,
                  label: crew.name
                }))}
              />
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

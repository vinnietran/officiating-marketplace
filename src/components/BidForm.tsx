import { useEffect, useMemo, useState } from "react";
import { buildBidSubmission, findActiveBid, getBidFormDefaults } from "../lib/bids";
import { getAvailableFootballPositionsForRoster, getCrewDefaultRoster } from "../lib/crewRosters";
import type { Bid, Crew, CrewRosterOfficial, Game, UserProfile } from "../types";
import { SearchableSelect } from "./ui/SearchableSelect";
import { Select } from "./ui/Select";

const FOOTBALL_POSITION_OPTIONS = [
  { value: "", label: "Unassigned" },
  { value: "R", label: "Referee (R)" },
  { value: "U", label: "Umpire (U)" },
  { value: "C", label: "Center Judge (C)" },
  { value: "H", label: "Head Line Judge (H)" },
  { value: "L", label: "Line Judge (L)" },
  { value: "S", label: "Side Judge (S)" },
  { value: "F", label: "Field Judge (F)" },
  { value: "B", label: "Back Judge (B)" },
  { value: "RO", label: "Replay Official (RO)" },
  { value: "RC", label: "Replay Communicator (RC)" },
  { value: "ALT", label: "Alternate (ALT)" }
] as const;

interface BidFormValues {
  officialName: string;
  bidderType: "individual" | "crew";
  crewId?: string;
  baseCrewId?: string;
  crewName?: string;
  proposedRoster?: CrewRosterOfficial[];
  amount: number;
  message?: string;
}

interface BidFormProps {
  postedPay: number;
  defaultOfficialName: string;
  sport: Game["sport"];
  availableCrews: Crew[];
  availableOfficials: UserProfile[];
  existingBids: Bid[];
  singleBidMode?: boolean;
  forceCrewOnly?: boolean;
  onSubmit: (values: BidFormValues) => Promise<void>;
  onCancel: () => void;
}

export function BidForm({
  postedPay,
  defaultOfficialName,
  sport,
  availableCrews,
  availableOfficials,
  existingBids,
  singleBidMode = false,
  forceCrewOnly = false,
  onSubmit,
  onCancel
}: BidFormProps) {
  const [officialName, setOfficialName] = useState(defaultOfficialName);
  const [bidderType, setBidderType] = useState<"individual" | "crew">("individual");
  const [selectedCrewId, setSelectedCrewId] = useState(availableCrews[0]?.id ?? "");
  const [proposedRoster, setProposedRoster] = useState<CrewRosterOfficial[]>([]);
  const [alternateOfficialId, setAlternateOfficialId] = useState("");
  const [amount, setAmount] = useState(String(postedPay));
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const noEligibleCrews = forceCrewOnly && availableCrews.length === 0;
  const isFootball = sport === "Football";

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
  }, [activeBid, postedPay]);

  useEffect(() => {
    if (bidderType !== "crew") {
      setProposedRoster([]);
      setAlternateOfficialId("");
      return;
    }

    if (!activeCrew) {
      setProposedRoster([]);
      setAlternateOfficialId("");
      return;
    }

    const activeBidBaseCrewId = activeBid?.baseCrewId ?? activeBid?.crewId;
    if (
      activeBid?.bidderType === "crew" &&
      activeBidBaseCrewId === activeCrew.id &&
      activeBid.proposedRoster &&
      activeBid.proposedRoster.length > 0
    ) {
      setProposedRoster(activeBid.proposedRoster);
      setAlternateOfficialId("");
      return;
    }

    setProposedRoster(getCrewDefaultRoster(activeCrew));
    setAlternateOfficialId("");
  }, [activeBid?.id, activeCrew?.id, bidderType]);

  const alternateOptions = useMemo(
    () =>
      availableOfficials
        .filter(
          (official) =>
            !proposedRoster.some((rosterOfficial) => rosterOfficial.officialUid === official.uid)
        )
        .map((official) => ({
          value: official.uid,
          label: (
            <span className="ui-searchable-select-option">
              <span className="ui-searchable-select-option-title">{official.displayName}</span>
              <span className="ui-searchable-select-option-meta">{official.email}</span>
            </span>
          ),
          searchText: `${official.displayName} ${official.email}`
        })),
    [availableOfficials, proposedRoster]
  );

  function updateRosterOfficial(
    officialUid: string,
    updater: (official: CrewRosterOfficial) => CrewRosterOfficial
  ) {
    setProposedRoster((current) =>
      current.map((official) =>
        official.officialUid === officialUid ? updater(official) : official
      )
    );
  }

  function removeRosterOfficial(officialUid: string) {
    setProposedRoster((current) =>
      current.filter((official) => official.officialUid !== officialUid)
    );
  }

  function addAlternateOfficial() {
    if (!alternateOfficialId) {
      return;
    }

    const selectedOfficial = availableOfficials.find(
      (official) => official.uid === alternateOfficialId
    );
    if (!selectedOfficial) {
      return;
    }

    const isBaseCrewMember = Boolean(activeCrew?.memberUids.includes(selectedOfficial.uid));
    const baseCrewRole = isBaseCrewMember
      ? activeCrew?.memberPositions[selectedOfficial.uid]
      : undefined;
    const assignedPositions = new Set(
      proposedRoster
        .map((official) => official.role)
        .filter((position): position is NonNullable<CrewRosterOfficial["role"]> => Boolean(position))
    );
    const nextRole = baseCrewRole && !assignedPositions.has(baseCrewRole) ? baseCrewRole : undefined;

    setProposedRoster((current) => [
      ...current,
      {
        officialUid: selectedOfficial.uid,
        officialName: selectedOfficial.displayName,
        officialEmail: selectedOfficial.email,
        ...(nextRole ? { role: nextRole } : {}),
        source: isBaseCrewMember ? "baseCrew" : "alternate",
        baseCrewMember: isBaseCrewMember
      }
    ]);
    setAlternateOfficialId("");
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    try {
      const submission = buildBidSubmission({
        officialName,
        bidderType,
        selectedCrewId,
        amount,
        message: "",
        activeBid,
        availableCrews,
        proposedRoster,
        requiresCrewBid: forceCrewOnly
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

      <details className="bid-form-guide" aria-label="Bid instructions">
        <summary className="bid-form-guide-summary">How this works</summary>
        <ul className="bid-form-guide-list">
          {bidderType === "crew" || forceCrewOnly ? (
            <>
              <li>Choose the crew you are bidding as for this game.</li>
              <li>Review the officials working this specific game. This does not change your permanent crew.</li>
              <li>Select an official below, then click <strong>Add to Roster</strong> to include them in this bid.</li>
              <li>Use <strong>Remove</strong> to leave someone off this game only.</li>
              {isFootball ? <li>Set each official&apos;s position for this game before submitting.</li> : null}
            </>
          ) : (
            <>
              <li>Choose your bid amount for this game.</li>
              <li>Submitting will place a new bid or update your current bid for this game.</li>
            </>
          )}
        </ul>
      </details>

      {availableCrews.length > 0 ? (
        <div className="bid-form-grid">
          {!forceCrewOnly ? (
            <label>
              Bid As
              <Select
                value={bidderType}
                onValueChange={(value) => setBidderType(value)}
                options={[
                  { value: "individual" as const, label: "Individual" },
                  { value: "crew" as const, label: "Crew" }
                ]}
              />
            </label>
          ) : null}

          {bidderType === "crew" ? (
            <label>
              {forceCrewOnly ? "Select Crew to Bid As" : "Crew"}
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
        </div>
      ) : null}

      {forceCrewOnly ? (
        <p className="hint-text">
          {noEligibleCrews
            ? "You are a member of one or more crews, but you are not the Referee for any crew eligible to place this bid."
            : "Varsity games require a crew bid."}
        </p>
      ) : null}

      {bidderType === "crew" && activeCrew ? (
        <section className="bid-roster-editor">
          <div className="bid-roster-header">
            <p className="bid-roster-title">Game roster</p>
            <p className="hint-text">
              This roster only applies to this game. Select an official, then click{" "}
              <strong>Add to Roster</strong>.
            </p>
          </div>

          {proposedRoster.length === 0 ? (
            <p className="empty-text">No officials selected for this game roster.</p>
          ) : (
            <ul className="crew-member-list">
              {proposedRoster.map((official) => (
                <li key={official.officialUid} className="crew-member-item">
                  <div>
                    <strong>{official.officialName}</strong>
                    <div className="meta-line">
                      {official.officialEmail ?? "Official"} •{" "}
                      {official.source === "alternate" ? "Alternate" : "Base crew"}
                    </div>
                    {isFootball ? (
                      <label className="crew-position-control">
                        Position
                        <Select
                          value={official.role ?? ""}
                          onValueChange={(value) =>
                            updateRosterOfficial(official.officialUid, (current) => ({
                              ...current,
                              role: value ? (value as CrewRosterOfficial["role"]) : undefined
                            }))
                          }
                          options={FOOTBALL_POSITION_OPTIONS.filter((option) =>
                            getAvailableFootballPositionsForRoster(
                              proposedRoster,
                              official.officialUid
                            ).includes(option.value)
                          ).map((option) => ({
                            value: option.value,
                            label: option.label
                          }))}
                        />
                      </label>
                    ) : null}
                  </div>
                  <button
                    type="button"
                    className="button-link-danger"
                    onClick={() => removeRosterOfficial(official.officialUid)}
                  >
                    Remove
                  </button>
                </li>
              ))}
            </ul>
          )}

          <div className="crew-invite-row">
            <label>
              Add Official to This Game
              <SearchableSelect
                value={alternateOfficialId}
                onValueChange={setAlternateOfficialId}
                placeholder="Select an official"
                searchPlaceholder="Search officials by name or email"
                emptyText="No matching officials found."
                options={alternateOptions}
              />
            </label>
            <button
              type="button"
              className="button-secondary"
              onClick={addAlternateOfficial}
              disabled={!alternateOfficialId}
            >
              Add to Roster
            </button>
          </div>
        </section>
      ) : null}

      <div className="bid-form-grid">
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
      </div>

      {activeBid ? (
        <p className="hint-text">
          Current offer for this game: <strong>${activeBid.amount}</strong>
        </p>
      ) : null}

      {error ? <p className="error-text">{error}</p> : null}

      <div className="bid-form-actions">
        <button type="submit" disabled={submitting || noEligibleCrews}>
          {submitting ? "Submitting..." : activeBid ? "Update Bid" : "Place Bid"}
        </button>
        <button type="button" className="button-secondary" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </form>
  );
}

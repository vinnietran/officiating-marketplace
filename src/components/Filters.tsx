import { useEffect, useMemo, useState } from "react";
import type { Level, Sport } from "../types";
import { validateMarketplaceDateRange } from "../lib/marketplaceDateFilter";
import { Select } from "./ui/Select";

export interface FilterValues {
  search: string;
  sport: "All" | Sport;
  level: "All" | Level;
  minPay: string;
  startDate: string;
  endDate: string;
}

interface FiltersProps {
  values: FilterValues;
  onChange: (next: FilterValues) => void;
}

const SPORT_OPTIONS: Array<"All" | Sport> = [
  "All",
  "Football",
  "Basketball",
  "Soccer",
  "Baseball"
];

const LEVEL_OPTIONS: Array<"All" | Level> = [
  "All",
  "NCAA",
  "Varsity",
  "Junior Varsity",
  "Middle School",
  "Youth"
];

export function Filters({ values, onChange }: FiltersProps) {
  const dateRangeError = validateMarketplaceDateRange(values);
  const [isMobile, setIsMobile] = useState(() =>
    typeof window !== "undefined" ? window.matchMedia("(max-width: 640px)").matches : false
  );
  const [isExpanded, setIsExpanded] = useState(() =>
    typeof window !== "undefined" ? !window.matchMedia("(max-width: 640px)").matches : true
  );
  const activeFilterCount = useMemo(
    () =>
      [
        values.search.trim(),
        values.sport !== "All" ? values.sport : "",
        values.level !== "All" ? values.level : "",
        values.minPay.trim(),
        values.startDate,
        values.endDate
      ].filter(Boolean).length,
    [values]
  );

  useEffect(() => {
    if (typeof window === "undefined") {
      return undefined;
    }

    const mediaQuery = window.matchMedia("(max-width: 640px)");
    const updateViewportState = (event?: MediaQueryListEvent) => {
      const matches = event?.matches ?? mediaQuery.matches;
      setIsMobile(matches);
      setIsExpanded((current) => (matches ? current : true));
    };

    updateViewportState();

    if (typeof mediaQuery.addEventListener === "function") {
      mediaQuery.addEventListener("change", updateViewportState);
      return () => mediaQuery.removeEventListener("change", updateViewportState);
    }

    mediaQuery.addListener(updateViewportState);
    return () => mediaQuery.removeListener(updateViewportState);
  }, []);

  useEffect(() => {
    if (isMobile && dateRangeError) {
      setIsExpanded(true);
    }
  }, [dateRangeError, isMobile]);

  return (
    <section className="filters filters-compact">
      {isMobile ? (
        <div className="filters-mobile-header">
          <div className="filters-mobile-copy">
            <span className="filters-mobile-title">Filters</span>
            <span className="filters-mobile-summary">
              {activeFilterCount > 0 ? `${activeFilterCount} active` : "Tap to refine results"}
            </span>
          </div>
          <button
            type="button"
            className="filters-mobile-toggle"
            aria-expanded={isExpanded}
            onClick={() => setIsExpanded((current) => !current)}
          >
            {isExpanded ? "Hide" : "Show"}
          </button>
        </div>
      ) : null}

      {(!isMobile || isExpanded) && (
        <>
          <div className="filters-grid">
            <label>
              School
              <input
                type="text"
                placeholder="Search school name"
                value={values.search}
                onChange={(event) => onChange({ ...values, search: event.target.value })}
              />
            </label>

            <label>
              Sport
              <Select
                value={values.sport}
                onValueChange={(sport) => onChange({ ...values, sport })}
                options={SPORT_OPTIONS.map((option) => ({
                  value: option,
                  label: option
                }))}
              />
            </label>

            <label>
              Level
              <Select
                value={values.level}
                onValueChange={(level) => onChange({ ...values, level })}
                options={LEVEL_OPTIONS.map((option) => ({
                  value: option,
                  label: option
                }))}
              />
            </label>

            <label>
              Minimum Pay
              <input
                type="number"
                min="0"
                placeholder="e.g. 100"
                value={values.minPay}
                onChange={(event) => onChange({ ...values, minPay: event.target.value })}
              />
            </label>

            <label>
              Start Date
              <input
                type="date"
                value={values.startDate}
                onChange={(event) => onChange({ ...values, startDate: event.target.value })}
              />
            </label>

            <label>
              End Date
              <input
                type="date"
                value={values.endDate}
                onChange={(event) => onChange({ ...values, endDate: event.target.value })}
              />
            </label>
          </div>

          {dateRangeError ? <p className="error-text">{dateRangeError}</p> : null}
        </>
      )}
    </section>
  );
}

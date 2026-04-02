import type { Level, Sport } from "../types";
import { Select } from "./ui/Select";

export interface FilterValues {
  search: string;
  sport: "All" | Sport;
  level: "All" | Level;
  minPay: string;
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
  return (
    <section className="filters filters-compact">
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
      </div>
    </section>
  );
}

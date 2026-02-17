import type { Level, Sport } from "../types";

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
    <section className="filters">
      <h2>Find Games</h2>
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
          <select
            value={values.sport}
            onChange={(event) =>
              onChange({ ...values, sport: event.target.value as FilterValues["sport"] })
            }
          >
            {SPORT_OPTIONS.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </label>

        <label>
          Level
          <select
            value={values.level}
            onChange={(event) =>
              onChange({ ...values, level: event.target.value as FilterValues["level"] })
            }
          >
            {LEVEL_OPTIONS.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
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

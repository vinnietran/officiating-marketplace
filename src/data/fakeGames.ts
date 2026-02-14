import type { Game } from "../types";

const SCHOOL_SEED_META = {
  createdByUid: "seed-school-user",
  createdByRole: "school" as const,
  createdAtISO: "2026-02-01T00:00:00.000Z",
  status: "open" as const
};

const ASSIGNOR_SEED_META = {
  createdByUid: "seed-assignor-user",
  createdByRole: "assignor" as const,
  createdAtISO: "2026-02-01T00:00:00.000Z",
  status: "open" as const
};

export const FAKE_GAMES: Game[] = [
  {
    id: "game-001",
    schoolName: "North Ridge High",
    sport: "Football",
    level: "Varsity",
    dateISO: "2026-02-21T18:00:00-05:00",
    location: "North Ridge Stadium, Columbus, OH",
    payPosted: 140,
    notes: "Rivalry game. Expect a large crowd.",
    ...SCHOOL_SEED_META
  },
  {
    id: "game-002",
    schoolName: "St. Peter Academy",
    sport: "Basketball",
    level: "Middle School",
    dateISO: "2026-02-20T17:30:00-05:00",
    location: "St. Peter Gym, Indianapolis, IN",
    payPosted: 90,
    ...SCHOOL_SEED_META
  },
  {
    id: "game-003",
    schoolName: "Lakeshore College",
    sport: "Soccer",
    level: "College",
    dateISO: "2026-02-22T14:00:00-05:00",
    location: "Lakeshore Field Complex, Cleveland, OH",
    payPosted: 220,
    notes: "Need one center referee for this slot.",
    ...SCHOOL_SEED_META
  },
  {
    id: "game-004",
    schoolName: "Maple Valley Youth League",
    sport: "Baseball",
    level: "Youth",
    dateISO: "2026-02-23T10:00:00-05:00",
    location: "Maple Valley Park, Dayton, OH",
    payPosted: 65,
    ...ASSIGNOR_SEED_META
  },
  {
    id: "game-005",
    schoolName: "Cedar Grove High",
    sport: "Soccer",
    level: "Varsity",
    dateISO: "2026-02-19T19:00:00-05:00",
    location: "Cedar Grove Turf, Louisville, KY",
    payPosted: 135,
    ...SCHOOL_SEED_META
  },
  {
    id: "game-006",
    schoolName: "Hamilton Prep",
    sport: "Basketball",
    level: "Varsity",
    dateISO: "2026-02-24T18:30:00-05:00",
    location: "Hamilton Event Center, Cincinnati, OH",
    payPosted: 150,
    notes: "Double-header assignment available.",
    ...ASSIGNOR_SEED_META
  },
  {
    id: "game-007",
    schoolName: "Riverside Middle",
    sport: "Football",
    level: "Middle School",
    dateISO: "2026-02-25T16:45:00-05:00",
    location: "Riverside Field, Lexington, KY",
    payPosted: 95,
    ...ASSIGNOR_SEED_META
  },
  {
    id: "game-008",
    schoolName: "Westbrook College",
    sport: "Baseball",
    level: "College",
    dateISO: "2026-02-26T13:00:00-05:00",
    location: "Westbrook Diamond, Ann Arbor, MI",
    payPosted: 210,
    ...SCHOOL_SEED_META
  },
  {
    id: "game-009",
    schoolName: "Oak Hills Youth Athletics",
    sport: "Soccer",
    level: "Youth",
    dateISO: "2026-02-27T09:30:00-05:00",
    location: "Oak Hills Community Park, Toledo, OH",
    payPosted: 60,
    ...ASSIGNOR_SEED_META
  },
  {
    id: "game-010",
    schoolName: "Summit Technical High",
    sport: "Football",
    level: "Varsity",
    dateISO: "2026-02-28T19:15:00-05:00",
    location: "Summit Tech Stadium, Fort Wayne, IN",
    payPosted: 165,
    notes: "Evening kickoff; parking pass provided.",
    ...SCHOOL_SEED_META
  }
];

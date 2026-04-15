import test from "node:test";
import assert from "node:assert/strict";

import {
  buildAssignedGameSubmission,
  filterAssignableOfficials,
  getCrewMemberPositionLabel,
  type IndividualAssignee
} from "../../src/lib/assignGame";
import type { Crew, UserProfile } from "../../src/types";

const officials: UserProfile[] = [
  {
    uid: "o1",
    email: "alex@example.com",
    displayName: "Alex Zebra",
    role: "official",
    createdAtISO: "2026-03-01T00:00:00.000Z"
  },
  {
    uid: "o2",
    email: "jamie@example.com",
    displayName: "Jamie Stripe",
    role: "official",
    createdAtISO: "2026-03-01T00:00:00.000Z"
  }
];

const crew: Crew = {
  id: "crew-1",
  name: "Metro Crew",
  createdByUid: "o1",
  createdByName: "Alex Zebra",
  createdByRole: "official",
  createdAtISO: "2026-03-01T00:00:00.000Z",
  crewChiefUid: "o1",
  crewChiefName: "Alex Zebra",
  memberUids: ["o1", "o2"],
  members: [
    { uid: "o1", name: "Alex Zebra", email: "alex@example.com" },
    { uid: "o2", name: "Jamie Stripe", email: "jamie@example.com" }
  ],
  memberPositions: { o1: "R", o2: "U" }
};

test("filterAssignableOfficials searches name and email", () => {
  assert.deepEqual(
    filterAssignableOfficials(officials, "jamie").map((official) => official.uid),
    ["o2"]
  );
  assert.deepEqual(
    filterAssignableOfficials(officials, "alex@example").map((official) => official.uid),
    ["o1"]
  );
  assert.deepEqual(
    filterAssignableOfficials(
      [
        ...officials,
        {
          uid: "o3",
          email: "vincenzo@example.com",
          displayName: "Vincenzo Tranquillo",
          role: "official",
          createdAtISO: "2026-03-01T00:00:00.000Z"
        }
      ],
      "vince tr"
    ).map((official) => official.uid),
    ["o3"]
  );
});

test("getCrewMemberPositionLabel reports assigned football positions", () => {
  assert.equal(getCrewMemberPositionLabel(crew, "o1"), "Referee (R)");
  assert.equal(getCrewMemberPositionLabel(crew, "missing"), "Unassigned");
});

test("buildAssignedGameSubmission builds mixed direct assignments", () => {
  const individualAssignments: IndividualAssignee[] = [
    {
      officialUid: "o1",
      officialName: "Alex Zebra",
      officialEmail: "alex@example.com",
      position: "R"
    }
  ];

  const result = buildAssignedGameSubmission({
    schoolName: "  Central High ",
    sport: "Football",
    level: "Varsity",
    requestedCrewSize: "5",
    dateLocal: "2026-03-20T18:00",
    location: " Stadium ",
    payPosted: "250",
    notes: " Bring cards ",
    individualAssignments,
    selectedCrews: [crew]
  });

  assert.equal(result.schoolName, "Central High");
  assert.equal(result.location, "Stadium");
  assert.equal(result.payPosted, 250);
  assert.equal(result.requestedCrewSize, 5);
  assert.equal(result.scheduledDateKey, "2026-03-20");
  assert.equal(result.directAssignments.length, 2);
  assert.deepEqual(result.directAssignments[0], {
    assignmentType: "individual",
    officialUid: "o1",
    officialName: "Alex Zebra",
    officialEmail: "alex@example.com",
    position: "R"
  });
});

test("buildAssignedGameSubmission rejects missing roster entries", () => {
  assert.throws(
    () =>
      buildAssignedGameSubmission({
        schoolName: "Central High",
        sport: "Football",
        level: "Varsity",
        requestedCrewSize: "1",
        dateLocal: "2026-03-20T18:00",
        location: "Stadium",
        payPosted: "250",
        notes: "",
        individualAssignments: [],
        selectedCrews: []
      }),
    /Crew size needed must be a whole number from 2 to 11/
  );

  assert.throws(
    () =>
      buildAssignedGameSubmission({
        schoolName: "Central High",
        sport: "Football",
        level: "Varsity",
        requestedCrewSize: "5",
        dateLocal: "2026-03-20T18:00",
        location: "Stadium",
        payPosted: "250",
        notes: "",
        individualAssignments: [],
        selectedCrews: []
      }),
    /Add at least one individual or one crew/
  );
});

import { describe, expect, it } from "vitest";
import {
  getDefaultMentorAvailability,
  MentorSearchError,
  searchMentors,
} from "@/domain/mentorship";
import {
  analyzeGaps,
  buildEffectiveEmployeeProfile,
  resolveTarget,
} from "@/domain/recommendation";
import {
  roleProfileKey,
  type ActivityHistoryRecord,
  type Employee,
  type NormalizedDataset,
  type ProficiencyLevel,
} from "@/lib/contracts";
import { loadChallengeDataset } from "../recommendation/test-utils";

function employee(
  id: string,
  level: ProficiencyLevel,
  overrides: Partial<Employee> = {},
): Employee {
  return {
    id,
    fullName: `Name ${id}`,
    department: "Platform",
    role: "Engineer",
    grade: "Junior",
    managerId: null,
    hireDate: "2025-01-01",
    tenureMonths: 20,
    workFormat: "hybrid",
    preferredLanguage: "en",
    careerGoal: null,
    skills: { SK_CORE: level },
    lastReviewDate: "2026-09-01",
    ...overrides,
  };
}

function fixture(
  people: Employee[] = [
    employee("REQUESTER", 1),
    employee("A", 3),
    employee("B", 4),
  ],
): NormalizedDataset {
  return {
    meta: { dataset: "Mentor fixture", version: "1", asOfDate: "2026-10-01" },
    proficiencyScale: {},
    skillsById: {
      SK_CORE: {
        id: "SK_CORE",
        name: "Core",
        type: "hard",
        category: "Tech",
        description: "",
      },
      SK_OTHER: {
        id: "SK_OTHER",
        name: "Other",
        type: "soft",
        category: "People",
        description: "",
      },
    },
    roleProfilesByKey: {
      [roleProfileKey("Engineer", "Middle")]: {
        role: "Engineer",
        grade: "Middle",
        requiredSkills: { SK_CORE: 3 },
        criticalSkills: ["SK_CORE"],
      },
      [roleProfileKey("Architect", "Lead")]: {
        role: "Architect",
        grade: "Lead",
        requiredSkills: { SK_CORE: 5 },
        criticalSkills: ["SK_CORE"],
      },
    },
    employeesById: Object.fromEntries(
      people.map((person) => [person.id, person]),
    ),
    eventsById: {
      IMPORTED_MENTORING: {
        id: "IMPORTED_MENTORING",
        title: "Practice",
        description: "",
        type: "mentoring",
        format: "online",
        durationHours: 2,
        mandatory: false,
        targetRoles: ["Engineer"],
        targetGrades: ["Junior"],
        developsSkills: [],
        prerequisites: {},
        upcomingSessions: [],
      },
      COURSE_GAIN: {
        id: "COURSE_GAIN",
        title: "Core workshop",
        description: "",
        type: "course",
        format: "self_paced",
        durationHours: 2,
        mandatory: false,
        targetRoles: ["Engineer"],
        targetGrades: ["Junior"],
        developsSkills: [{ skillId: "SK_CORE", gain: 1, maxLevel: 5 }],
        prerequisites: {},
        upcomingSessions: [],
      },
    },
    history: [],
    historyByEmployeeId: Object.fromEntries(
      people.map((person) => [person.id, []]),
    ),
  };
}

function history(
  dataset: NormalizedDataset,
  employeeId: string,
  overrides: Partial<ActivityHistoryRecord> = {},
) {
  const record: ActivityHistoryRecord = {
    id: `H_${dataset.history.length}`,
    employeeId,
    eventId: "IMPORTED_MENTORING",
    date: "2026-08-01",
    status: "completed",
    completionPct: 100,
    assignedBy: "self",
    ...overrides,
  };
  dataset.history.push(record);
  (dataset.historyByEmployeeId[employeeId] ??= []).push(record);
}

const query = { employeeId: "REQUESTER", skillId: "SK_CORE" };

describe("private mentor search", () => {
  it("validates a selected mentor before the result limit without bypassing qualification or availability", () => {
    const people = Array.from({ length: 110 }, (_, index) =>
      employee(`MENTOR_${index}`, 4),
    );
    const dataset = fixture([
      employee("REQUESTER", 1),
      employee("LOW", 2),
      ...people,
    ]);
    const capped = searchMentors(dataset, { ...query, limit: 100 });
    const excluded = people.find(
      (person) =>
        !capped.mentors.some((mentor) => mentor.employeeId === person.id),
    )!;
    expect(excluded).toBeDefined();
    expect(
      searchMentors(dataset, {
        ...query,
        mentorId: excluded.id,
        limit: 1,
      }).mentors.map((mentor) => mentor.employeeId),
    ).toEqual([excluded.id]);
    expect(
      searchMentors(dataset, { ...query, mentorId: "LOW" }).mentors,
    ).toEqual([]);
    expect(
      searchMentors(
        dataset,
        { ...query, mentorId: excluded.id, availableOnly: true },
        { availability: { [excluded.id]: false } },
      ).mentors,
    ).toEqual([]);
    expect(
      searchMentors(dataset, { ...query, mentorId: query.employeeId }).mentors,
    ).toEqual([]);
  });

  it("uses the target requirement, includes level 3 when sufficient and excludes self", () => {
    const dataset = fixture([
      employee("REQUESTER", 3),
      employee("LOW", 2),
      employee("A", 3),
    ]);
    expect(searchMentors(dataset, query)).toEqual({
      skillId: "SK_CORE",
      requiredLevel: 3,
      mentors: [
        {
          employeeId: "A",
          fullName: "Name A",
          role: "Engineer",
          grade: "Junior",
          skillLevel: 3,
          available: false,
        },
      ],
    });
    dataset.employeesById.REQUESTER.careerGoal = {
      targetRole: "Architect",
      targetGrade: "Lead",
    };
    expect(searchMentors(dataset, query)).toEqual({
      skillId: "SK_CORE",
      requiredLevel: 5,
      mentors: [],
    });
  });

  it("uses core replay to discover a qualified mentor and preserves the raw snapshot", () => {
    const dataset = fixture([
      employee("REQUESTER", 1),
      employee("REPLAYED", 2),
    ]);
    history(dataset, "REPLAYED", {
      eventId: "COURSE_GAIN",
      date: "2026-09-20",
    });
    const before = structuredClone(dataset);
    const result = searchMentors(dataset, query);
    expect(result.mentors).toMatchObject([
      { employeeId: "REPLAYED", skillLevel: 3 },
    ]);
    expect(dataset).toEqual(before);
    dataset.history[0].date = "2026-09-01";
    expect(searchMentors(dataset, query).mentors).toEqual([]);
  });

  it("infers availability from mentoring kind and valid participation, not event IDs", () => {
    const dataset = fixture();
    expect(getDefaultMentorAvailability(dataset, "A")).toBe(false);
    history(dataset, "A", { status: "declined" });
    history(dataset, "A", { date: "2026-10-02" });
    history(dataset, "A", { eventId: "COURSE_GAIN" });
    expect(getDefaultMentorAvailability(dataset, "A")).toBe(false);
    history(dataset, "A", { status: "in_progress" });
    expect(getDefaultMentorAvailability(dataset, "A")).toBe(true);
    history(dataset, "B");
    expect(getDefaultMentorAvailability(dataset, "B")).toBe(true);
  });

  it("honours explicit availability, including opt-out after mentoring history", () => {
    const dataset = fixture();
    history(dataset, "A");
    const options = { availability: { A: false, B: true } };
    expect(
      searchMentors(
        dataset,
        { ...query, availableOnly: true },
        options,
      ).mentors.map((mentor) => mentor.employeeId),
    ).toEqual(["B"]);
    const all = searchMentors(dataset, query, options).mentors;
    expect(all.find((mentor) => mentor.employeeId === "A")?.available).toBe(
      false,
    );
    expect(all.find((mentor) => mentor.employeeId === "B")?.available).toBe(
      true,
    );
    expect(options).toEqual({ availability: { A: false, B: true } });
  });

  it("filters on trusted department and role without disclosing department or history", () => {
    const dataset = fixture([
      employee("REQUESTER", 1),
      employee("A", 4),
      employee("B", 4, { department: "Data" }),
      employee("C", 4, { role: "Architect" }),
    ]);
    history(dataset, "A");
    const result = searchMentors(dataset, {
      ...query,
      department: "Platform",
      role: "Engineer",
      availableOnly: true,
    });
    expect(result.mentors.map((mentor) => mentor.employeeId)).toEqual(["A"]);
    expect(Object.keys(result).sort()).toEqual([
      "mentors",
      "requiredLevel",
      "skillId",
    ]);
    expect(Object.keys(result.mentors[0]).sort()).toEqual([
      "available",
      "employeeId",
      "fullName",
      "grade",
      "role",
      "skillLevel",
    ]);
    expect(
      searchMentors(dataset, { ...query, department: "Absent" }).mentors,
    ).toEqual([]);
  });

  it("remains deterministic independent of employee object insertion order and limits after ranking", () => {
    const dataset = fixture();
    const first = searchMentors(dataset, query);
    expect(searchMentors(dataset, query)).toEqual(first);
    dataset.employeesById = Object.fromEntries(
      Object.entries(dataset.employeesById).reverse(),
    );
    expect(searchMentors(dataset, query)).toEqual(first);
    expect(searchMentors(dataset, { ...query, limit: 1 }).mentors).toEqual(
      first.mentors.slice(0, 1),
    );
  });

  it("prefers a qualified, close and willing mentor without exposing ranking factors", () => {
    const dataset = fixture([
      employee("REQUESTER", 1),
      employee("QUALIFIED", 5),
      employee("DISTANT", 3, { department: "Other", role: "Architect" }),
    ]);
    history(dataset, "QUALIFIED");
    expect(searchMentors(dataset, query).mentors[0].employeeId).toBe(
      "QUALIFIED",
    );
  });

  it("moves an equally qualified busy mentor behind an available-capacity colleague", () => {
    const dataset = fixture([
      employee("REQUESTER", 1),
      employee("A", 4),
      employee("B", 4),
    ]);
    const first = searchMentors(dataset, query).mentors[0].employeeId;
    const result = searchMentors(dataset, query, {
      activeLoad: { [first]: 8 },
    });
    expect(result.mentors[0].employeeId).not.toBe(first);
  });

  it("distributes first suggestions across requesters even when thread loads are zero", () => {
    const requesters = Array.from({ length: 30 }, (_, index) =>
      employee(`REQUESTER_${index}`, 1),
    );
    const dataset = fixture([
      ...requesters,
      employee("A", 4),
      employee("B", 4),
      employee("C", 4),
    ]);
    const selections = requesters.map(
      ({ id }) =>
        searchMentors(dataset, { ...query, employeeId: id }).mentors[0]
          .employeeId,
    );
    expect(new Set(selections).size).toBe(3);
    expect(
      Math.max(
        ...["A", "B", "C"].map(
          (id) => selections.filter((value) => value === id).length,
        ),
      ),
    ).toBeLessThan(20);
  });

  it("rejects invalid input with stable codes and returns an honest empty qualified pool", () => {
    const dataset = fixture([employee("REQUESTER", 1), employee("LOW", 2)]);
    expect(searchMentors(dataset, query).mentors).toEqual([]);
    for (const [input, code] of [
      [{ ...query, employeeId: "UNKNOWN" }, "UNKNOWN_EMPLOYEE"],
      [{ ...query, skillId: "UNKNOWN" }, "UNKNOWN_SKILL"],
      [{ ...query, skillId: "SK_OTHER" }, "SKILL_NOT_REQUIRED"],
      [{ ...query, limit: 0 }, "INVALID_LIMIT"],
      [{ ...query, limit: 101 }, "INVALID_LIMIT"],
      [{ ...query, limit: Number.NaN }, "INVALID_LIMIT"],
    ] as const) {
      expect(() => searchMentors(dataset, input)).toThrowError(
        new MentorSearchError(code),
      );
    }
    dataset.employeesById.REQUESTER.grade = "Lead";
    expect(() => searchMentors(dataset, query)).toThrowError(
      new MentorSearchError("NO_TARGET"),
    );
  });

  it("finds qualified colleagues for the 29 skills with real open critical gaps", () => {
    const dataset = loadChallengeDataset();
    const requestBySkill = new Map<
      string,
      { employeeId: string; requiredLevel: number }
    >();
    for (const employeeId of Object.keys(dataset.employeesById)) {
      const profile = buildEffectiveEmployeeProfile(dataset, employeeId);
      const analysis = analyzeGaps(profile, resolveTarget(dataset, profile));
      for (const gap of analysis.gaps) {
        if (gap.critical && gap.gap > 0 && !requestBySkill.has(gap.skillId))
          requestBySkill.set(gap.skillId, {
            employeeId,
            requiredLevel: gap.requiredLevel,
          });
      }
    }
    expect(requestBySkill.size).toBe(29);
    for (const [skillId, request] of requestBySkill) {
      const result = searchMentors(dataset, {
        employeeId: request.employeeId,
        skillId,
      });
      expect(result.requiredLevel).toBe(request.requiredLevel);
      expect(
        result.mentors.length,
        `${skillId} for ${request.employeeId}`,
      ).toBeGreaterThan(0);
      expect(
        result.mentors.every(
          (mentor) =>
            mentor.skillLevel >= request.requiredLevel &&
            mentor.employeeId !== request.employeeId,
        ),
      ).toBe(true);
    }
  });

  it("covers all 33 catalog critical skills for valid new requesters using existing role requirements", () => {
    const source = loadChallengeDataset();
    const criticalSkills = new Set(
      Object.values(source.roleProfilesByKey).flatMap(
        (profile) => profile.criticalSkills,
      ),
    );
    expect(criticalSkills.size).toBe(33);
    for (const skillId of criticalSkills) {
      const target = Object.values(source.roleProfilesByKey).find((profile) =>
        profile.criticalSkills.includes(skillId),
      )!;
      const requester = employee(`NEW_REQUESTER_${skillId}`, 0, {
        role: target.role,
        grade: target.grade,
        careerGoal: { targetRole: target.role, targetGrade: target.grade },
        skills: {},
      });
      const dataset = {
        ...source,
        employeesById: { ...source.employeesById, [requester.id]: requester },
        historyByEmployeeId: {
          ...source.historyByEmployeeId,
          [requester.id]: [],
        },
      };
      const result = searchMentors(dataset, {
        employeeId: requester.id,
        skillId,
      });
      expect(result.requiredLevel).toBe(target.requiredSkills[skillId]);
      expect(result.mentors.length, skillId).toBeGreaterThan(0);
      expect(
        result.mentors.every(
          (mentor) => mentor.skillLevel >= result.requiredLevel,
        ),
      ).toBe(true);
    }
  });
});

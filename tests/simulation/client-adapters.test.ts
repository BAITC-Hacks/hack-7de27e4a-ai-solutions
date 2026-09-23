import { readFileSync } from "node:fs";
import path from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import { recommendForEmployee } from "@/domain/recommendation";
import { requestBoundedAiReview } from "@/state/ai-review";
import {
  describeDatasetImportError,
  importDatasetTextBundle,
} from "@/state/dataset-import";

const sourceRoot = path.resolve(process.cwd(), "data/source");

function loadTextBundle() {
  return {
    employees: readFileSync(path.join(sourceRoot, "employees.json"), "utf8"),
    skills: readFileSync(path.join(sourceRoot, "skills.json"), "utf8"),
    events: readFileSync(path.join(sourceRoot, "events.json"), "utf8"),
    activityHistoryCsv: readFileSync(
      path.join(sourceRoot, "activity_history.csv"),
      "utf8",
    ),
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("Career Quest client adapters", () => {
  it("imports the four judge files through the canonical importer", () => {
    const dataset = importDatasetTextBundle(loadTextBundle());

    expect(Object.keys(dataset.employeesById)).toHaveLength(200);
    expect(Object.keys(dataset.skillsById)).toHaveLength(60);
    expect(Object.keys(dataset.eventsById)).toHaveLength(40);
    expect(dataset.history).toHaveLength(2743);
  });

  it("keeps structured validation locations for the import UI", () => {
    let thrown: unknown;
    try {
      importDatasetTextBundle({
        employees: "{}",
        skills: "not-json",
        events: "{}",
        activityHistoryCsv: "",
      });
    } catch (error) {
      thrown = error;
    }

    expect(describeDatasetImportError(thrown)).toEqual([
      expect.objectContaining({ source: "skills.json", path: "$" }),
    ]);
  });

  it("sends only allowlisted recommendation evidence to bounded AI", async () => {
    const dataset = importDatasetTextBundle(loadTextBundle());
    const result = Object.keys(dataset.employeesById)
      .sort()
      .map((employeeId) => recommendForEmployee(dataset, employeeId))
      .find((candidate) => candidate.recommendations.length > 0);
    const recommendation = result?.recommendations[0];
    expect(recommendation).toBeDefined();
    if (!recommendation || !result) return;

    const fetchMock = vi.fn(async (_input: string | URL | Request, init?: RequestInit) =>
      new Response(
        JSON.stringify({
          status: "verified",
          language: result.effectiveProfile.employee.preferredLanguage,
          selectedCandidateIds: [recommendation.activityId],
          reasons: [
            {
              candidateId: recommendation.activityId,
              evidenceIds: [`${recommendation.activityId}:e1`],
              explanation: "Verified against the supplied receipt.",
            },
          ],
          text: "Verified against the supplied receipt.",
          fallbackUsed: false,
          latencyMs: 12,
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    const recommendations = result.recommendations.slice(0, 3);
    await requestBoundedAiReview(
      result.employeeId,
      recommendations,
      result.effectiveProfile.employee.preferredLanguage,
    );

    const request = fetchMock.mock.calls[0];
    const payload = JSON.parse(String(request?.[1]?.body)) as Record<string, unknown>;
    expect(request?.[0]).toBe("/api/ai/review");
    expect(Object.keys(payload).sort()).toEqual([
      "candidateIds",
      "completedActivityIds",
      "employeeId",
      "language",
    ]);
    expect(JSON.stringify(payload)).not.toContain(result.effectiveProfile.employee.fullName);
    expect(payload.employeeId).toBe(result.employeeId);
    expect(payload.candidateIds).toEqual(recommendations.map((item) => item.activityId));
    expect(payload.completedActivityIds).toEqual([]);
    const serializedPayload = JSON.stringify(payload);
    expect(serializedPayload).toContain(result.employeeId);
    expect(serializedPayload).not.toContain("evidence");
    (dataset.historyByEmployeeId[result.employeeId] ?? []).forEach((record) => {
      expect(serializedPayload).not.toContain(record.id);
    });

    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          status: "verified",
          language: result.effectiveProfile.employee.preferredLanguage,
          selectedCandidateIds: ["UNKNOWN_ACTIVITY"],
          reasons: [
            {
              candidateId: "UNKNOWN_ACTIVITY",
              evidenceIds: ["UNKNOWN_EVIDENCE"],
              explanation: "Untrusted response",
            },
          ],
          text: "Untrusted response",
          fallbackUsed: false,
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    );
    await expect(
      requestBoundedAiReview(
        result.employeeId,
        recommendations,
        result.effectiveProfile.employee.preferredLanguage,
      ),
    ).rejects.toThrow(/allowlist/);
  });

  it("never calls the external route for a browser-import dataset", async () => {
    const dataset = importDatasetTextBundle(loadTextBundle());
    const result = recommendForEmployee(dataset, "E0028");
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      requestBoundedAiReview(
        result.employeeId,
        result.recommendations,
        result.effectiveProfile.employee.preferredLanguage,
        [],
        "imported",
      ),
    ).rejects.toThrow(/server provenance/);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

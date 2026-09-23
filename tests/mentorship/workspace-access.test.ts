import { beforeEach, describe, expect, it, vi } from "vitest";
import { GET } from "@/app/api/demo-dataset/route";
import type { DemoSession } from "@/lib/identity/types";
import type { NormalizedDataset } from "@/lib/contracts";
import { loadChallengeDataset } from "../recommendation/test-utils";

const identity = vi.hoisted(() => ({
  readSession: vi.fn<(request: Request) => Promise<DemoSession | null>>(),
  getIdentityDataset: vi.fn<() => Promise<NormalizedDataset>>(),
}));
vi.mock("@/lib/identity", () => identity);

const dataset = loadChallengeDataset();
const employee = Object.values(dataset.employeesById).find(
  (person) => person.role !== "HR Business Partner",
)!;
const hr = Object.values(dataset.employeesById).find(
  (person) => person.role === "HR Business Partner",
)!;
const session = (access: "employee" | "hr"): DemoSession => {
  const person = access === "hr" ? hr : employee;
  return { employeeId: person.id, fullName: person.fullName, role: access };
};
const request = (expected?: string) =>
  new Request("http://localhost/api/demo-dataset", {
    headers: expected ? { "X-Career-Identity": expected } : {},
  });

beforeEach(() => {
  vi.resetAllMocks();
  identity.getIdentityDataset.mockResolvedValue(dataset);
  identity.readSession.mockResolvedValue(session("employee"));
});

describe("signed demo workspace boundary", () => {
  it("rejects an unauthenticated request before loading organization data", async () => {
    identity.readSession.mockResolvedValue(null);
    const response = await GET(request());
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: "SESSION_REQUIRED" });
    expect(identity.getIdentityDataset).not.toHaveBeenCalled();
    expect(response.headers.get("cache-control")).toBe("no-store");
  });

  it("serializes only the signed employee profile and their history, without mutating the source", async () => {
    const original = structuredClone(dataset);
    const response = await GET(request(employee.id));
    expect(response.status).toBe(200);
    const body = (await response.json()) as { dataset: NormalizedDataset };
    expect(Object.keys(body.dataset.employeesById)).toEqual([employee.id]);
    expect(Object.keys(body.dataset.historyByEmployeeId)).toEqual([
      employee.id,
    ]);
    expect(body.dataset.employeesById[employee.id]).toEqual(
      dataset.employeesById[employee.id],
    );
    expect(body.dataset.history).toEqual(
      dataset.historyByEmployeeId[employee.id],
    );
    expect(
      body.dataset.history.every((record) => record.employeeId === employee.id),
    ).toBe(true);
    expect(body.dataset.historyByEmployeeId[employee.id]).toEqual(
      body.dataset.history,
    );
    expect(body.dataset.eventsById).toEqual(dataset.eventsById);
    expect(body.dataset.skillsById).toEqual(dataset.skillsById);
    expect(dataset).toEqual(original);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("vary")).toContain("Cookie");
  });

  it("returns the organizational snapshot only for the trusted HR session", async () => {
    identity.readSession.mockResolvedValue(session("hr"));
    const response = await GET(request(hr.id));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ dataset });
  });

  it("rejects a stale browser identity before returning data", async () => {
    const response = await GET(request(hr.id));
    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ error: "SESSION_CHANGED" });
    expect(identity.getIdentityDataset).not.toHaveBeenCalled();
  });

  it.each(["identity", "dataset"] as const)(
    "returns a bounded 503 response when %s is unavailable",
    async (failure) => {
      const error = new Error(
        "Private storage path C:/secret/company.json and confidential diagnostic",
      );
      if (failure === "identity") identity.readSession.mockRejectedValue(error);
      else identity.getIdentityDataset.mockRejectedValue(error);
      const response = await GET(request(employee.id));
      expect(response.status).toBe(503);
      expect(await response.json()).toEqual({ error: "DEMO_UNAVAILABLE" });
      expect(response.headers.get("cache-control")).toBe("no-store");
    },
  );
});

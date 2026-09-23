import { readSession, getIdentityDataset } from "@/lib/identity";
import type { NormalizedDataset } from "@/lib/contracts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "no-store", Vary: "Cookie" };

/** Personal data is delivered only for the signed viewer. HR has organizational access. */
export function projectDemoDataset(dataset: NormalizedDataset, employeeId: string, access: "employee" | "hr"): NormalizedDataset {
  if (access === "hr") return dataset;
  const employee = dataset.employeesById[employeeId];
  if (!employee) throw new Error("UNKNOWN_EMPLOYEE");
  const history = dataset.historyByEmployeeId[employeeId] ?? [];
  return { ...dataset, employeesById: { [employeeId]: employee }, history,
    historyByEmployeeId: { [employeeId]: history } };
}

export async function GET(request: Request) {
  try {
    const session = await readSession(request);
    if (!session) return Response.json({ error: "SESSION_REQUIRED" }, { status: 401, headers });
    const expected = request.headers.get("X-Career-Identity");
    if (expected && expected !== session.employeeId) return Response.json({ error: "SESSION_CHANGED" }, { status: 409, headers });
    const dataset = await getIdentityDataset();
    return Response.json({ dataset: projectDemoDataset(dataset, session.employeeId, session.role) }, { headers });
  } catch {
    return Response.json({ error: "DEMO_UNAVAILABLE" }, { status: 503, headers });
  }
}

import { z } from "zod";
import {
  getIdentityDataset,
  readSession,
  sessionCookie,
  signDemoSession,
} from "@/lib/identity";
import {
  ApiError,
  apiError,
  apiJson,
  checkWriteOrigin,
  readJson,
} from "@/lib/identity/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  try {
    return apiJson({ session: await readSession(request) });
  } catch (error) {
    return apiError(error);
  }
}
export async function POST(request: Request): Promise<Response> {
  try {
    const { employeeId } = await readJson(
      request,
      z.object({ employeeId: z.string().min(1).max(80) }).strict(),
      1024,
    );
    const employees = (await getIdentityDataset()).employeesById;
    const employee = Object.hasOwn(employees, employeeId)
      ? employees[employeeId]
      : undefined;
    if (!employee) throw new ApiError(400, "UNKNOWN_EMPLOYEE");
    const session = {
      employeeId: employee.id,
      fullName: employee.fullName,
      role: employee.role === "HR Business Partner" ? "hr" : "employee",
    };
    return apiJson(
      { session },
      {
        headers: {
          "Set-Cookie": sessionCookie(
            signDemoSession(employee.id),
            false,
            request,
          ),
        },
      },
    );
  } catch (error) {
    return apiError(error);
  }
}
export async function DELETE(request: Request): Promise<Response> {
  try {
    checkWriteOrigin(request);
    const expected = request.headers.get("x-career-identity");
    if (expected) {
      const session = await readSession(request);
      if (session && session.employeeId !== expected)
        throw new ApiError(409, "SESSION_CHANGED");
    }
    return apiJson(
      { session: null },
      { headers: { "Set-Cookie": sessionCookie("", true, request) } },
    );
  } catch (error) {
    return apiError(error);
  }
}

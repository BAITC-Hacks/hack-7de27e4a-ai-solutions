import { getIdentityDataset } from "@/lib/identity";
import { apiError, apiJson } from "@/lib/identity/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(): Promise<Response> {
  try {
    const people = Object.values((await getIdentityDataset()).employeesById)
      .sort((a, b) => a.id.localeCompare(b.id))
      .map((employee) => ({
        employeeId: employee.id,
        fullName: employee.fullName,
        role: employee.role,
        grade: employee.grade,
        department: employee.department,
        access: employee.role === "HR Business Partner" ? "hr" : "employee",
      }));
    return apiJson({ people });
  } catch (error) {
    return apiError(error);
  }
}

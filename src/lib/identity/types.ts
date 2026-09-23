/** Demo identification only. A user can choose any known employee; replace with SSO in production. */
export interface DemoSession {
  employeeId: string;
  fullName: string;
  role: "employee" | "hr";
}

export interface DemoPerson {
  employeeId: string;
  fullName: string;
  role: string;
  grade: string;
  department: string;
  access: "employee" | "hr";
}

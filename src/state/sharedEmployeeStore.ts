"use client";
import { createEmployeeStore } from "./employeeStore";
import { createRealIntelligenceAdapter } from "./realIntelligenceAdapter";
/** One browser-session store shared by Employee, HR and Trust. Uploads never execute server-side. */
export const sharedEmployeeStore = createEmployeeStore(
  createRealIntelligenceAdapter(),
);

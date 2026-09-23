"use client";

import { createContext, useContext, useMemo, type ReactNode } from "react";

export type DemoAccess = "employee" | "hr";
export interface DemoModeValue {
  access: DemoAccess;
  setAccess: (access: DemoAccess) => void;
}

const DemoModeContext = createContext<DemoModeValue | null>(null);

/** Share AppProviders' existing view mode without owning employee data or navigation. */
export function DemoModeProvider({
  access,
  setAccess,
  children,
}: DemoModeValue & { children: ReactNode }) {
  const value = useMemo(() => ({ access, setAccess }), [access, setAccess]);
  return (
    <DemoModeContext.Provider value={value}>
      {children}
    </DemoModeContext.Provider>
  );
}

export function useDemoMode() {
  return useContext(DemoModeContext);
}

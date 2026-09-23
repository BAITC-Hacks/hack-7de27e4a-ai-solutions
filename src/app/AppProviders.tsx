"use client";
import { useState, type ReactNode } from "react";
import { EmployeeStoreProvider } from "@/state/EmployeeStoreProvider";
import { sharedEmployeeStore } from "@/state/sharedEmployeeStore";
import { EmployeeStoreTrustBridge } from "@/components/trust/EmployeeStoreTrustBridge";
import { AppShell } from "@/components/app/AppShell";

/** One browser session across all routes. Demo access is a view switch, not authentication. */
export function AppProviders({ children }: { children: ReactNode }) {
  const [access, setAccess] = useState<"employee" | "hr">("employee");
  return (
    <EmployeeStoreProvider store={sharedEmployeeStore}>
      <EmployeeStoreTrustBridge store={sharedEmployeeStore} access={access}>
        <AppShell access={access} onAccessChange={setAccess}>
          {children}
        </AppShell>
      </EmployeeStoreTrustBridge>
    </EmployeeStoreProvider>
  );
}

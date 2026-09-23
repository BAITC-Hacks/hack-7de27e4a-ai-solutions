"use client";
import { useEffect, useState, type ReactNode } from "react";
import { EmployeeStoreProvider } from "@/state/EmployeeStoreProvider";
import { sharedEmployeeStore } from "@/state/sharedEmployeeStore";
import { EmployeeStoreTrustBridge } from "@/components/trust/EmployeeStoreTrustBridge";
import { AppShell } from "@/components/app/AppShell";
import { I18nProvider } from "@/lib/i18n/I18nProvider";
import type { Locale } from "@/lib/i18n/core";
import { IdentityProvider, useIdentity } from "@/components/identity/IdentityProvider";
import {
  DemoModeProvider,
  type DemoAccess,
} from "@/components/app/DemoModeContext";

/** One store and one signed demo identity across all active routes. */
export function AppProviders({
  children,
  initialLocale = "ru",
}: {
  children: ReactNode;
  initialLocale?: Locale;
}) {
  return (
    <I18nProvider initialLocale={initialLocale}>
      <IdentityProvider><WorkspaceProviders>{children}</WorkspaceProviders></IdentityProvider>
    </I18nProvider>
  );
}

function WorkspaceProviders({ children }: { children: ReactNode }) {
  const identity = useIdentity();
  const [requestedAccess, setRequestedAccess] = useState<DemoAccess>("employee");
  useEffect(() => { setRequestedAccess(identity.session?.role === "hr" ? "hr" : "employee"); }, [identity.session?.employeeId, identity.session?.role]);
  const access: DemoAccess = identity.session?.role === "hr" ? requestedAccess : "employee";
  const setAccess = (next: DemoAccess) => {
    if (next === "hr" && identity.session?.role !== "hr") identity.openPicker("hr");
    else setRequestedAccess(next);
  };
  return (
      <DemoModeProvider access={access} setAccess={setAccess}>
        <EmployeeStoreProvider store={sharedEmployeeStore}>
          <EmployeeStoreTrustBridge store={sharedEmployeeStore} access={access}>
            <AppShell access={access} onAccessChange={setAccess}>
              {children}
            </AppShell>
          </EmployeeStoreTrustBridge>
        </EmployeeStoreProvider>
      </DemoModeProvider>
  );
}

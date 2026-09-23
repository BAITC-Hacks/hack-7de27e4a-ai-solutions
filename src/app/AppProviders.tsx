"use client";
import { useState, type ReactNode } from "react";
import { EmployeeStoreProvider } from "@/state/EmployeeStoreProvider";
import { sharedEmployeeStore } from "@/state/sharedEmployeeStore";
import { EmployeeStoreTrustBridge } from "@/components/trust/EmployeeStoreTrustBridge";
import { AppShell } from "@/components/app/AppShell";
import { I18nProvider } from "@/lib/i18n/I18nProvider";
import type { Locale } from "@/lib/i18n/core";

/** One browser session across all routes. Demo access is a view switch, not authentication. */
export function AppProviders({ children, initialLocale = "ru" }: { children: ReactNode; initialLocale?: Locale }) {
  const [access, setAccess] = useState<"employee" | "hr">("employee");
  return (
    <I18nProvider initialLocale={initialLocale}><EmployeeStoreProvider store={sharedEmployeeStore}>
      <EmployeeStoreTrustBridge store={sharedEmployeeStore} access={access}>
        <AppShell access={access} onAccessChange={setAccess}>
          {children}
        </AppShell>
      </EmployeeStoreTrustBridge>
    </EmployeeStoreProvider></I18nProvider>
  );
}

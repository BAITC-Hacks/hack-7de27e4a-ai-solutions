"use client";

import { useState } from "react";

import { HRDashboard } from "../../components/hr/HRDashboard";
import {
  HrEventBuilder,
  type EventBuilderRequest,
} from "../../components/hr/event-builder";
import { useTrustIntegration } from "../../components/trust/integration";
import { IntegrationGate, Surface } from "../../components/trust/Surface";
import { useI18n } from "@/lib/i18n/I18nProvider";
import { useOptionalEmployeeStore } from "@/state/EmployeeStoreProvider";

export default function HRPage() {
  const integration = useTrustIntegration();
  const { t } = useI18n();
  const store = useOptionalEmployeeStore();
  const [builderRequest, setBuilderRequest] =
    useState<EventBuilderRequest | null>(null);

  return (
    <Surface active="hr">
      <IntegrationGate>
        {integration?.analytics ? (
          <HRDashboard
            input={integration.analytics}
            onCreateCatalogActivity={
              store
                ? (skillId, role) =>
                    setBuilderRequest((current) => ({
                      skillId,
                      role,
                      version: (current?.version ?? 0) + 1,
                    }))
                : undefined
            }
            eventBuilder={
              store ? (
                <HrEventBuilder store={store} request={builderRequest} />
              ) : undefined
            }
          />
        ) : (
          <p>
            {t(
              "Загрузите набор данных на экране сотрудника.",
              "Қызметкер бетінде деректер жиынын жүктеңіз.",
              "Upload a dataset on the employee page.",
            )}
          </p>
        )}
      </IntegrationGate>
    </Surface>
  );
}

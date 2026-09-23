'use client';
import { HRDashboard } from '../../components/hr/HRDashboard';
import { useTrustIntegration } from '../../components/trust/integration';
import { IntegrationGate, Surface } from '../../components/trust/Surface';

export default function HRPage() {
  const integration = useTrustIntegration();
  return <Surface active="hr"><IntegrationGate>{integration?.analytics ? <HRDashboard input={integration.analytics} /> : <p>Загрузите набор данных на экране сотрудника.</p>}</IntegrationGate></Surface>;
}

'use client';
import { TrustDashboard } from '../../components/trust/TrustDashboard';
import { useTrustIntegration } from '../../components/trust/integration';
import { IntegrationGate, Surface } from '../../components/trust/Surface';
export default function TrustPage() {
  const integration = useTrustIntegration();
  return <Surface active="trust"><IntegrationGate>{integration && <TrustDashboard integration={integration} />}</IntegrationGate></Surface>;
}


'use client';
import { HRDashboard } from '../../components/hr/HRDashboard';
import { useTrustIntegration } from '../../components/trust/integration';
import { IntegrationGate, Surface } from '../../components/trust/Surface';
import { useI18n } from '@/lib/i18n/I18nProvider';

export default function HRPage() {
  const integration = useTrustIntegration();
  const { t } = useI18n();
  return <Surface active="hr"><IntegrationGate>{integration?.analytics ? <HRDashboard input={integration.analytics} /> : <p>{t('Загрузите набор данных на экране сотрудника.', 'Қызметкер бетінде деректер жиынын жүктеңіз.', 'Upload a dataset on the employee page.')}</p>}</IntegrationGate></Surface>;
}

import GovDashboardClient from './client';

export const metadata = {
  title: 'Government Dashboard — DADIP India',
  description: 'AI-powered disaster management dashboard for Indian government agencies. Reports, predictions, and alert dispatch.',
};

export default function GovernmentPage() {
  return <GovDashboardClient />;
}

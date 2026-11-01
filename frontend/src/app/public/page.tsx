import PublicDashboardClient from './client';

export const metadata = {
  title: 'Public Dashboard — DADIP India',
  description: 'Real-time disaster warnings, incident reporting, and help center locator for Indian citizens.',
};

export default function PublicPage() {
  return <PublicDashboardClient />;
}

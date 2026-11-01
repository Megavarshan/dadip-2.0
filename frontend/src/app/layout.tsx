import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'DADIP 2.0 — Disaster Intelligence & Resilient Communication',
  description:
    'DADIP 2.0: decision-admissibility disaster intelligence, an approval-gated communication engine with retry, deduplication and expiry, and offline-first edge devices over MQTT.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body suppressHydrationWarning className="font-sans antialiased">{children}</body>
    </html>
  );
}

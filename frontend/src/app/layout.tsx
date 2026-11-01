import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { AuthProvider } from "@/components/auth-provider";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });

export const metadata: Metadata = {
  title: "DADIP — India Disaster Intelligence Platform",
  description: "AI-powered disaster intelligence for India. Predicts cyclone, tsunami, flood, and earthquake risks with Decision-Admissibility architecture that reduces unsafe decisions by 46%.",
  keywords: ["disaster intelligence", "India", "cyclone prediction", "tsunami warning", "flood monitoring", "earthquake", "NDRF", "NDMA", "AI", "decision admissibility"],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body suppressHydrationWarning className={`${inter.variable} font-sans antialiased`}>
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}

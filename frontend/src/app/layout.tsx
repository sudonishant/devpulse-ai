import type { Metadata } from "next";
import { Plus_Jakarta_Sans, Geist_Mono } from "next/font/google";
import "./globals.css";

const sansFont = Plus_Jakarta_Sans({
  variable: "--font-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "DevPulse AI | Code Audit & Incident Simulation Demo",
  description: "A local FastAPI/Next.js demo for provider-backed code audits and incident simulations with LangGraph orchestration and a mock Splunk MCP workflow.",
  openGraph: {
    title: "DevPulse AI | Code Audit & Incident Simulation Demo",
    description: "A local FastAPI/Next.js demo for provider-backed code audits and incident simulations with LangGraph orchestration and a mock Splunk MCP workflow.",
    type: "website",
  },
  twitter: {
    card: "summary",
    title: "DevPulse AI | Code Audit & Incident Simulation Demo",
    description: "A local FastAPI/Next.js demo for provider-backed code audits and incident simulations with LangGraph orchestration and a mock Splunk MCP workflow.",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${sansFont.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col font-sans">{children}</body>
    </html>
  );
}

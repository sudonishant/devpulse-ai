import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "DevPulse AI | Autonomous Multi-Agent Code Reviewer & Security Auditor",
  description: "DevPulse AI is a prototype, autonomous code auditing platform that intercepts vulnerabilities and performance bottlenecks using parallel agentic reasoning.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className="h-full antialiased"
    >
      <body className="min-h-full flex flex-col font-sans">{children}</body>
    </html>
  );
}

import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { WorkspaceProvider } from "@/context/WorkspaceContext";
import { SpeedInsights } from "@vercel/speed-insights/next";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
  display: "swap",
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
  display: "swap",
});

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
};

export const metadata: Metadata = {
  title: "SheetSnap — Offline Document Table Extraction & Excel Export",
  description:
    "Enterprise-grade 100% offline desktop tool to extract structured tables from receipts, invoices, and documents into Microsoft Excel.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col font-sans bg-slate-50/50 text-slate-900 selection:bg-slate-900 selection:text-white overflow-x-hidden">
        <WorkspaceProvider>
          {children}
        </WorkspaceProvider>
        <SpeedInsights />
      </body>
    </html>
  );
}


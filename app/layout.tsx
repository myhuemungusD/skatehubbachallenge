import "./globals.css";
import type { Metadata } from "next";
import { AnalyticsConsent } from "@/components/AnalyticsConsent";
import { ServiceWorkerRegister } from "@/components/ServiceWorkerRegister";
import { Toaster } from "@/components/ui/toaster";

export const metadata: Metadata = {
  title: "SkateHubba",
  description: "Play live S.K.8 battles anywhere with SkateHubba.",
  themeColor: "#0a0a0a",
  manifest: "/manifest.webmanifest"
};

export default function RootLayout({
  children
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="bg-hubba-black">
      <body className="min-h-screen bg-hubba-black text-slate-100 antialiased">
        <ServiceWorkerRegister />
        <div className="mx-auto flex min-h-screen max-w-5xl flex-col px-4 py-6 sm:px-8">
          {children}
        </div>
        <AnalyticsConsent />
        <Toaster />
      </body>
    </html>
  );
}

"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";

const STORAGE_KEY = "skatehubba-consent";

export const AnalyticsConsent = () => {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const consent = window.localStorage.getItem(STORAGE_KEY);
    if (!consent) {
      setVisible(true);
    }
  }, []);

  const handleConsent = (choice: "granted" | "denied") => {
    window.localStorage.setItem(STORAGE_KEY, choice);
    setVisible(false);
    if (window.gtag) {
      window.gtag("consent", "update", {
        analytics_storage: choice,
        ad_storage: choice
      });
    }
  };

  if (!visible) return null;

  return (
    <div className="fixed bottom-4 left-1/2 z-50 w-[90vw] max-w-md -translate-x-1/2 rounded-3xl border border-white/20 bg-black/90 p-5 shadow-2xl backdrop-blur">
      <h2 className="text-lg font-semibold text-white">Allow analytics?</h2>
      <p className="mt-2 text-sm text-slate-300">
        SkateHubba uses anonymous analytics to improve the live battle experience. Choose how you want to
        share data.
      </p>
      <div className="mt-4 flex flex-wrap gap-3">
        <Button onClick={() => handleConsent("granted")} className="flex-1">
          Accept
        </Button>
        <Button onClick={() => handleConsent("denied")} variant="ghost" className="flex-1">
          Decline
        </Button>
      </div>
    </div>
  );
};

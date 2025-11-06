import { Suspense } from "react";
import { HomeView } from "@/components/HomeView";

export default function Page() {
  return (
    <Suspense fallback={<div className="flex flex-1 items-center justify-center text-slate-400">Loading…</div>}>
      <HomeView />
    </Suspense>
  );
}

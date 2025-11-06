import { Suspense } from "react";
import { GameView } from "@/components/GameView";

export default function GamePage({ params }: { params: { code: string } }) {
  return (
    <Suspense fallback={<div className="flex flex-1 items-center justify-center text-slate-400">Loading game…</div>}>
      <GameView code={params.code.toUpperCase()} />
    </Suspense>
  );
}

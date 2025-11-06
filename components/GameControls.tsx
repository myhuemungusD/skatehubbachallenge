"use client";

import { Button } from "@/components/ui/button";
import type { GameState, Phase, PlayerSlot } from "@/lib/types";

interface Props {
  game: GameState;
  slot: PlayerSlot | null;
  loadingAction: boolean;
  onApproveSet: () => Promise<void>;
  onDeclineSet: () => Promise<void>;
  onApproveResponse: () => Promise<void>;
  onFailResponse: () => Promise<void>;
}

export const phaseLabel: Record<Phase, string> = {
  SET_RECORD: "Set your trick",
  SET_JUDGE: "Judge the set",
  RESP_RECORD: "Answer the trick",
  RESP_JUDGE: "Judge the response"
};

export const GameControls = ({
  game,
  slot,
  loadingAction,
  onApproveSet,
  onDeclineSet,
  onApproveResponse,
  onFailResponse
}: Props) => {
  const isSetter = slot === game.turn;
  const isOpponent = slot && slot !== game.turn;

  return (
    <section className="rounded-3xl border border-white/10 bg-white/5 p-5">
      <header className="flex flex-col gap-2">
        <p className="text-sm uppercase tracking-[0.3em] text-hubba-orange/80">Phase</p>
        <h2 className="text-2xl font-semibold text-white">{phaseLabel[game.phase]}</h2>
      </header>
      <div className="mt-4 flex flex-wrap gap-3">
        {game.phase === "SET_RECORD" && isSetter ? (
          <p className="text-sm text-slate-300">
            You control the pace. Record a single attempt — no retries — and it will auto-submit.
          </p>
        ) : null}
        {game.phase === "SET_JUDGE" && isOpponent ? (
          <div className="flex w-full flex-col gap-3">
            <p className="text-sm text-slate-300">Did the setter land the trick?</p>
            <div className="flex gap-3">
              <Button className="flex-1" onClick={onApproveSet} disabled={loadingAction}>
                Approve
              </Button>
              <Button className="flex-1" variant="destructive" onClick={onDeclineSet} disabled={loadingAction}>
                Decline
              </Button>
            </div>
          </div>
        ) : null}
        {game.phase === "RESP_RECORD" && isOpponent ? (
          <p className="text-sm text-slate-300">Match the line. Record once — it automatically uploads.</p>
        ) : null}
        {game.phase === "RESP_JUDGE" && isSetter ? (
          <div className="flex w-full flex-col gap-3">
            <p className="text-sm text-slate-300">Did they make it?</p>
            <div className="flex gap-3">
              <Button className="flex-1" onClick={onApproveResponse} disabled={loadingAction}>
                Make
              </Button>
              <Button className="flex-1" variant="destructive" onClick={onFailResponse} disabled={loadingAction}>
                Fail
              </Button>
            </div>
          </div>
        ) : null}
        {(!isSetter && !isOpponent) || game.phase === "SET_JUDGE" ? (
          <p className="text-sm text-slate-500">
            Waiting for opponent actions. Grab a breath and get hype.
          </p>
        ) : null}
      </div>
    </section>
  );
};

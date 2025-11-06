import { lettersForCount } from "@/lib/utils";
import type { GameState } from "@/lib/types";

interface Props {
  game: GameState;
  highlight?: "A" | "B" | null;
}

export const ScoreBoard = ({ game, highlight }: Props) => {
  return (
    <section aria-label="Score" className="rounded-3xl border border-white/10 bg-white/5 p-5">
      <header className="flex items-center justify-between">
        <p className="text-sm uppercase tracking-[0.4em] text-hubba-green/80">Live score</p>
        <span className="rounded-full bg-hubba-green/10 px-3 py-1 text-xs font-semibold uppercase text-hubba-green">
          Turn: {game.turn}
        </span>
      </header>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        {(Object.entries(game.players) as ["A" | "B", (typeof game.players)["A"]][]).map(([slot, player]) => (
          <div
            key={slot}
            className={`flex flex-col rounded-2xl border border-white/10 p-4 transition ${
              highlight === slot ? "border-hubba-green/80 shadow-glow" : ""
            }`}
          >
            <div className="flex items-center justify-between">
              <p className="text-lg font-semibold text-white">{player.name}</p>
              <span className="text-sm uppercase tracking-[0.4em] text-slate-400">
                {lettersForCount(player.letters)}
              </span>
            </div>
            <p className="mt-2 text-xs font-semibold uppercase text-slate-500">Player {slot}</p>
          </div>
        ))}
      </div>
      {game.winner ? (
        <p className="mt-4 rounded-2xl bg-hubba-green/10 p-3 text-center text-sm font-semibold text-hubba-green">
          Winner locked: {game.winner === game.players.A.uid ? game.players.A.name : game.players.B.name}
        </p>
      ) : null}
    </section>
  );
};

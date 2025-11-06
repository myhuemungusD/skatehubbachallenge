import type { GameState, GameHistoryEntry } from "@/lib/types";

interface Props {
  entries: GameHistoryEntry[];
  game: GameState;
}

const resultLabel: Record<GameHistoryEntry["result"], string> = {
  declined_set: "Set Declined",
  approved_set: "Set Approved",
  landed: "Landed",
  failed: "Failed"
};

const badgeColor: Record<GameHistoryEntry["result"], string> = {
  declined_set: "bg-yellow-500/20 text-yellow-200",
  approved_set: "bg-hubba-green/20 text-hubba-green",
  landed: "bg-hubba-green/20 text-hubba-green",
  failed: "bg-red-500/20 text-red-200"
};

export const GameHistory = ({ entries, game }: Props) => {
  if (entries.length === 0) {
    return (
      <section className="rounded-3xl border border-white/10 bg-white/5 p-5">
        <p className="text-sm text-slate-400">No clips yet. First make sets the tone.</p>
      </section>
    );
  }

  return (
    <section className="rounded-3xl border border-white/10 bg-white/5 p-5">
      <header className="mb-4 flex items-center justify-between">
        <h2 className="text-lg font-semibold text-white">Session history</h2>
        <span className="text-xs uppercase tracking-[0.4em] text-slate-500">Clips</span>
      </header>
      <div className="flex flex-col gap-4">
        {entries.map((entry, index) => {
          const setter = game.players[entry.by];
          return (
            <div key={`${entry.by}-${entry.ts}-${index}`} className="grid gap-3 sm:grid-cols-[180px,1fr]">
              <div className="flex flex-col gap-2">
                <p className="text-sm font-semibold text-white">{setter?.name}</p>
                <span className={`inline-flex w-fit rounded-full px-3 py-1 text-xs ${badgeColor[entry.result]}`}>
                  {resultLabel[entry.result]}
                </span>
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                {entry.setPath ? (
                  <ClipThumbnail path={entry.setPath} label="Set" />
                ) : (
                  <Placeholder label="Set" />
                )}
                {entry.respPath ? (
                  <ClipThumbnail path={entry.respPath} label="Response" />
                ) : (
                  <Placeholder label="Response" />
                )}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
};

const ClipThumbnail = ({ path, label }: { path: string; label: string }) => (
  <figure className="overflow-hidden rounded-2xl border border-white/10 bg-black/80">
    <video src={path} controls className="h-44 w-full object-cover" preload="metadata" />
    <figcaption className="px-3 py-2 text-xs uppercase tracking-[0.3em] text-slate-400">{label}</figcaption>
  </figure>
);

const Placeholder = ({ label }: { label: string }) => (
  <div className="flex h-44 flex-col items-center justify-center rounded-2xl border border-white/10 bg-black/50 text-xs uppercase tracking-[0.3em] text-slate-500">
    No {label}
  </div>
);

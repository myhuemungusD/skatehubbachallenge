"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { GameControls } from "@/components/GameControls";
import { GameHistory } from "@/components/GameHistory";
import { ScoreBoard } from "@/components/ScoreBoard";
import { VideoRecorder } from "@/components/VideoRecorder";
import { useFirebaseAuth } from "@/lib/hooks/useAuth";
import { useGameSubscription } from "@/lib/hooks/useGameSubscription";
import { uploadGameVideo } from "@/lib/firebase/storage";
import { callFunction } from "@/lib/firebase/functionsClient";
import type { Phase } from "@/lib/types";
import { useToast } from "@/store/toastStore";

interface Props {
  code: string;
}

export const GameView = ({ code }: Props) => {
  const { user, handle, loading, ensureAnonymous } = useFirebaseAuth();
  const { game, loading: loadingGame, slot } = useGameSubscription(code, user?.uid);
  const { toast } = useToast();
  const [uploading, setUploading] = useState(false);
  const canRecord = useMemo(() => {
    if (!game || !slot) return false;
    if (game.phase === "SET_RECORD" && slot === game.turn) return true;
    if (game.phase === "RESP_RECORD" && slot !== game.turn) return true;
    return false;
  }, [game, slot]);

  const allowSelfFail = useMemo(() => {
    if (!game || !slot) return false;
    if (game.phase === "SET_RECORD" && slot === game.turn) return true;
    if (game.phase === "RESP_RECORD" && slot !== game.turn) return true;
    return false;
  }, [game, slot]);

  useEffect(() => {
    ensureAnonymous();
  }, [ensureAnonymous]);

  const uploadAndNotify = async (blob: Blob, phase: Phase) => {
    if (!user || !game || !slot) {
      toast({ title: "Not ready", description: "Sign in and join the lobby first.", variant: "destructive" });
      return;
    }
    try {
      setUploading(true);
      const { path } = await uploadGameVideo(game.id, phase, slot, blob);
      if (phase === "SET_RECORD") {
        await callFunction("submitSetClip", { gameId: game.id, storagePath: path });
      } else if (phase === "RESP_RECORD") {
        await callFunction("submitRespClip", { gameId: game.id, storagePath: path });
      }
      toast({ title: "Clip sent", description: "Uploaded with plaza-grade encryption." });
    } catch (error) {
      toast({
        title: "Upload error",
        description: error instanceof Error ? error.message : "Could not upload clip.",
        variant: "destructive"
      });
    } finally {
      setUploading(false);
    }
  };

  const handleSelfFail = async () => {
    if (!game) return;
    try {
      if (game.phase === "SET_RECORD") {
        await callFunction("selfFailSet", { gameId: game.id });
      } else if (game.phase === "RESP_RECORD") {
        await callFunction("selfFailResp", { gameId: game.id });
      }
    } catch (error) {
      toast({
        title: "Unable to mark fail",
        description: error instanceof Error ? error.message : "Could not submit self fail.",
        variant: "destructive"
      });
    }
  };

  const judgeSet = async (approve: boolean) => {
    if (!game) return;
    try {
      await callFunction("judgeSet", { gameId: game.id, approve });
    } catch (error) {
      toast({
        title: "Judging failed",
        description: error instanceof Error ? error.message : "Could not record verdict.",
        variant: "destructive"
      });
    }
  };

  const judgeResp = async (approve: boolean) => {
    if (!game) return;
    try {
      await callFunction("judgeResp", { gameId: game.id, approve });
    } catch (error) {
      toast({
        title: "Judging failed",
        description: error instanceof Error ? error.message : "Could not record verdict.",
        variant: "destructive"
      });
    }
  };

  if (loading || loadingGame) {
    return <div className="flex flex-1 items-center justify-center text-slate-400">Synching plaza feed…</div>;
  }

  if (!game) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-4 text-center text-slate-300">
        <p>Lobby not found or you do not have access.</p>
        <Button asChild>
          <Link href="/">Return home</Link>
        </Button>
      </div>
    );
  }

  if (!handle) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-4 text-center text-slate-300">
        <p>Lock your handle before entering the battle.</p>
        <Button asChild>
          <Link href="/">Set handle</Link>
        </Button>
      </div>
    );
  }

  return (
    <main className="flex flex-1 flex-col gap-6">
      <header className="flex flex-col gap-2 rounded-3xl border border-white/10 bg-white/5 p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-[0.4em] text-hubba-green/80">Lobby code</p>
            <h1 className="text-3xl font-semibold text-white">{game.code}</h1>
          </div>
          <div className="rounded-full border border-white/10 bg-black/60 px-4 py-2 text-sm text-slate-300">
            Phase: {game.phase.split("_").join(" → ")}
          </div>
        </div>
      </header>

      <ScoreBoard game={game} highlight={game.turn} />

      <section className="grid gap-6 lg:grid-cols-2">
        <GameControls
          game={game}
          slot={slot}
          loadingAction={uploading}
          onApproveSet={() => judgeSet(true)}
          onDeclineSet={() => judgeSet(false)}
          onApproveResponse={() => judgeResp(true)}
          onFailResponse={() => judgeResp(false)}
        />
        <div className="rounded-3xl border border-white/10 bg-white/5 p-5">
          <h2 className="text-lg font-semibold text-white">Record center</h2>
          <p className="mt-1 text-sm text-slate-400">
            Capture with one try. Uploads go straight to Firebase Storage with resumable safety nets.
          </p>
          <div className="mt-4">
            <VideoRecorder
              onVideoFinalized={(blob) => uploadAndNotify(blob, game.phase)}
              disabled={!canRecord || uploading || !!game.winner}
              allowSelfFail={allowSelfFail}
              onSelfFail={handleSelfFail}
            />
          </div>
          {!canRecord ? (
            <p className="mt-3 text-xs text-slate-500">Waiting for your turn.</p>
          ) : null}
        </div>
      </section>

      <GameHistory entries={game.history ?? []} game={game} />
    </main>
  );
};

import { useEffect, useMemo, useState } from "react";
import { doc, onSnapshot, Timestamp } from "firebase/firestore";
import { firebaseDb } from "@/lib/firebase/client";
import type { GameState, PlayerSlot } from "@/lib/types";

const normalizeHistory = (entries: any[] | undefined) => {
  if (!Array.isArray(entries)) return [];
  return entries.map((entry) => {
    const tsValue = entry.ts instanceof Timestamp
      ? entry.ts.toDate().toISOString()
      : typeof entry.ts === "number"
        ? new Date(entry.ts).toISOString()
        : "";
    return {
      ...entry,
      ts: tsValue
    };
  });
};

export const useGameSubscription = (gameId: string | undefined, uid: string | undefined) => {
  const db = firebaseDb();
  const [game, setGame] = useState<GameState | null>(null);
  const [loading, setLoading] = useState<boolean>(true);

  useEffect(() => {
    if (!gameId) return;
    const gameRef = doc(db, "games", gameId);
    return onSnapshot(
      gameRef,
      (snapshot) => {
        if (!snapshot.exists()) {
          setGame(null);
          setLoading(false);
          return;
        }
        const data = snapshot.data();
        const history = normalizeHistory(data.history);
        setGame({ id: snapshot.id, ...data, history } as GameState);
        setLoading(false);
      },
      () => setLoading(false)
    );
  }, [db, gameId]);

  const slot = useMemo<PlayerSlot | null>(() => {
    if (!game || !uid) return null;
    if (game.players?.A?.uid === uid) return "A";
    if (game.players?.B?.uid === uid) return "B";
    return null;
  }, [game, uid]);

  return {
    game,
    loading,
    slot
  };
};

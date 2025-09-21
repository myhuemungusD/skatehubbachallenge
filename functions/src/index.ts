import * as functions from "firebase-functions";
import * as admin from "firebase-admin";
import * as Sentry from "@sentry/node";
import type { firestore as FirestoreNS } from "firebase-admin";

type PlayerSlot = "A" | "B";
type Phase = "SET_RECORD" | "SET_JUDGE" | "RESP_RECORD" | "RESP_JUDGE";

type Transaction = FirestoreNS.Transaction;
type DocumentReference<T> = FirestoreNS.DocumentReference<T>;
type UpdateData<T> = FirestoreNS.UpdateData<T>;

type GameHistoryEntry = {
  by: PlayerSlot;
  setPath?: string | null;
  respPath?: string | null;
  result: "declined_set" | "approved_set" | "landed" | "failed";
  ts: FirebaseFirestore.Timestamp | number;
};

type GameDoc = {
  code: string;
  turn: PlayerSlot;
  phase: Phase;
  winner?: string | null;
  players: Record<PlayerSlot, { uid: string; name: string; letters: number }>;
  current: {
    by: PlayerSlot;
    setVideoPath?: string | null;
    responseVideoPath?: string | null;
  };
  history: GameHistoryEntry[];
};

if (!admin.apps.length) {
  admin.initializeApp();
}

Sentry.init({ dsn: process.env.SENTRY_DSN || "" });

const db = admin.firestore();

type CallableContext = functions.https.CallableContext;

const ensureAuth = (context: CallableContext) => {
  if (!context.auth) {
    throw new functions.https.HttpsError("unauthenticated", "Sign in to continue");
  }
  return context.auth.uid;
};

const assertRateLimit = async (uid: string, key: string, windowMs: number) => {
  const rateRef = db.collection("rateLimits").doc(uid);
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(rateRef);
    const now = Date.now();
    const data = (snap.data() as Record<string, number> | undefined) ?? {};
    const last = data[key] ?? 0;
    if (now - last < windowMs) {
      throw new functions.https.HttpsError("resource-exhausted", "Too many actions. Slow down.");
    }
    tx.set(rateRef, { [key]: now }, { merge: true });
  });
};

const getHandle = async (uid: string) => {
  const profileSnap = await db.collection("users").doc(uid).get();
  if (!profileSnap.exists || !profileSnap.data()?.handle) {
    throw new functions.https.HttpsError("failed-precondition", "Complete your handle before playing.");
  }
  return profileSnap.data()!.handle as string;
};

const randomCode = async () => {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  for (let i = 0; i < 5; i += 1) {
    const code = Array.from({ length: 5 })
      .map(() => alphabet[Math.floor(Math.random() * alphabet.length)]!)
      .join("");
    const doc = await db.collection("games").doc(code).get();
    if (!doc.exists) return code;
  }
  throw new functions.https.HttpsError("internal", "Could not allocate game code");
};

const getPlayerSlot = (game: GameDoc, uid: string): PlayerSlot | null => {
  if (game.players.A?.uid === uid) return "A";
  if (game.players.B?.uid === uid) return "B";
  return null;
};

const opponentSlot = (slot: PlayerSlot): PlayerSlot => (slot === "A" ? "B" : "A");

const appendHistory = (tx: Transaction, ref: DocumentReference<GameDoc>, entry: GameHistoryEntry) => {
  tx.update(ref, {
    history: admin.firestore.FieldValue.arrayUnion({
      ...entry,
      ts: admin.firestore.FieldValue.serverTimestamp()
    })
  });
};

const withGame = async (
  code: string,
  handler: (game: GameDoc, tx: Transaction, ref: DocumentReference<GameDoc>) => Promise<void>
) => {
  const gameRef = db.collection("games").doc(code) as DocumentReference<GameDoc>;
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(gameRef);
    if (!snap.exists) {
      throw new functions.https.HttpsError("not-found", "Game not found");
    }
    await handler(snap.data() as GameDoc, tx, gameRef);
  });
};

export const setHandle = functions
  .region("us-central1")
  .runWith({ maxInstances: 10 })
  .https.onCall(async (data: { handle?: string }, context) => {
    try {
      const uid = ensureAuth(context);
      const handle = (data.handle ?? "").trim();
      if (!/^[a-zA-Z0-9-]{3,20}$/.test(handle)) {
        throw new functions.https.HttpsError(
          "invalid-argument",
          "Handle must be 3-20 characters of letters, numbers, or hyphen."
        );
      }
      const lower = handle.toLowerCase();
      const existing = await db.collection("users").where("handleLower", "==", lower).get();
      if (!existing.empty && existing.docs[0]!.id !== uid) {
        throw new functions.https.HttpsError("already-exists", "Handle already taken.");
      }
      await db.collection("users").doc(uid).set(
        {
          handle,
          handleLower: lower,
          createdAt: admin.firestore.FieldValue.serverTimestamp()
        },
        { merge: true }
      );
      return { handle };
    } catch (error) {
      Sentry.captureException(error);
      throw error;
    }
  });

export const createGame = functions
  .region("us-central1")
  .runWith({ maxInstances: 20 })
  .https.onCall(async (_data, context) => {
    try {
      const uid = ensureAuth(context);
      await assertRateLimit(uid, "create", 5000);
      const handle = await getHandle(uid);
      const code = await randomCode();
      const gameRef = db.collection("games").doc(code);
      const payload: GameDoc = {
        code,
        turn: "A",
        phase: "SET_RECORD",
        winner: null,
        players: {
          A: { uid, name: handle, letters: 0 },
          B: { uid: "", name: "Awaiting rival", letters: 0 }
        },
        current: {
          by: "A",
          setVideoPath: null,
          responseVideoPath: null
        },
        history: []
      };
      await gameRef.create(payload);
      return { code };
    } catch (error) {
      Sentry.captureException(error);
      if (error instanceof functions.https.HttpsError) throw error;
      throw new functions.https.HttpsError("internal", "Unable to create game");
    }
  });

export const joinGame = functions
  .region("us-central1")
  .runWith({ maxInstances: 20 })
  .https.onCall(async (data: { code?: string }, context) => {
    try {
      const uid = ensureAuth(context);
      await assertRateLimit(uid, "join", 3000);
      const handle = await getHandle(uid);
      const code = (data.code ?? "").trim().toUpperCase();
      if (!code) {
        throw new functions.https.HttpsError("invalid-argument", "Code required");
      }
      const gameRef = db.collection("games").doc(code);
      await db.runTransaction(async (tx) => {
        const snap = await tx.get(gameRef);
        if (!snap.exists) {
          throw new functions.https.HttpsError("not-found", "Game not found");
        }
        const game = snap.data() as GameDoc;
        const existingSlot = getPlayerSlot(game, uid);
        if (existingSlot) {
          return;
        }
        if (game.players.B.uid && game.players.B.uid !== uid) {
          throw new functions.https.HttpsError("resource-exhausted", "Lobby full");
        }
        tx.update(gameRef, {
          "players.B": { uid, name: handle, letters: game.players.B.letters ?? 0 }
        });
      });
      return { gameId: code };
    } catch (error) {
      Sentry.captureException(error);
      throw error;
    }
  });

export const submitSetClip = functions
  .region("us-central1")
  .runWith({ maxInstances: 40 })
  .https.onCall(async (data: { gameId?: string; storagePath?: string }, context) => {
    const uid = ensureAuth(context);
    const { gameId, storagePath } = data;
    if (!gameId || !storagePath) {
      throw new functions.https.HttpsError("invalid-argument", "Missing params");
    }
    await withGame(gameId, async (game, tx, ref) => {
      const slot = getPlayerSlot(game, uid);
      if (!slot) throw new functions.https.HttpsError("permission-denied", "Not part of this game");
      if (slot !== game.turn) {
        throw new functions.https.HttpsError("failed-precondition", "Not your set");
      }
      if (game.phase !== "SET_RECORD") {
        throw new functions.https.HttpsError("failed-precondition", "Cannot submit set clip right now");
      }
      tx.update(ref, {
        phase: "SET_JUDGE",
        current: {
          by: slot,
          setVideoPath: storagePath,
          responseVideoPath: null
        }
      });
    });
    return { ok: true };
  });

export const judgeSet = functions
  .region("us-central1")
  .runWith({ maxInstances: 40 })
  .https.onCall(async (data: { gameId?: string; approve?: boolean }, context) => {
    const uid = ensureAuth(context);
    const { gameId, approve } = data;
    if (!gameId || typeof approve !== "boolean") {
      throw new functions.https.HttpsError("invalid-argument", "Missing params");
    }
    await withGame(gameId, async (game, tx, ref) => {
      const slot = getPlayerSlot(game, uid);
      if (!slot) throw new functions.https.HttpsError("permission-denied", "Not part of this game");
      if (slot === game.turn) {
        throw new functions.https.HttpsError("failed-precondition", "Setter cannot judge set");
      }
      if (game.phase !== "SET_JUDGE") {
        throw new functions.https.HttpsError("failed-precondition", "Wrong phase");
      }
      if (!game.current?.setVideoPath) {
        throw new functions.https.HttpsError("failed-precondition", "No set clip found");
      }
      if (!approve) {
        const nextTurn = opponentSlot(game.turn);
        appendHistory(tx, ref, {
          by: game.turn,
          setPath: game.current.setVideoPath,
          result: "declined_set"
        });
        tx.update(ref, {
          phase: "SET_RECORD",
          turn: nextTurn,
          current: {
            by: nextTurn,
            setVideoPath: null,
            responseVideoPath: null
          }
        });
      } else {
        tx.update(ref, {
          phase: "RESP_RECORD"
        });
      }
    });
    return { ok: true };
  });

export const submitRespClip = functions
  .region("us-central1")
  .runWith({ maxInstances: 40 })
  .https.onCall(async (data: { gameId?: string; storagePath?: string }, context) => {
    const uid = ensureAuth(context);
    const { gameId, storagePath } = data;
    if (!gameId || !storagePath) {
      throw new functions.https.HttpsError("invalid-argument", "Missing params");
    }
    await withGame(gameId, async (game, tx, ref) => {
      const slot = getPlayerSlot(game, uid);
      if (!slot) throw new functions.https.HttpsError("permission-denied", "Not part of this game");
      if (slot === game.turn) {
        throw new functions.https.HttpsError("failed-precondition", "Setter cannot respond");
      }
      if (game.phase !== "RESP_RECORD") {
        throw new functions.https.HttpsError("failed-precondition", "Wrong phase");
      }
      tx.update(ref, {
        phase: "RESP_JUDGE",
        current: {
          ...game.current,
          responseVideoPath: storagePath
        }
      });
    });
    return { ok: true };
  });

export const judgeResp = functions
  .region("us-central1")
  .runWith({ maxInstances: 40 })
  .https.onCall(async (data: { gameId?: string; approve?: boolean }, context) => {
    const uid = ensureAuth(context);
    const { gameId, approve } = data;
    if (!gameId || typeof approve !== "boolean") {
      throw new functions.https.HttpsError("invalid-argument", "Missing params");
    }
    await withGame(gameId, async (game, tx, ref) => {
      const slot = getPlayerSlot(game, uid);
      if (!slot) throw new functions.https.HttpsError("permission-denied", "Not part of this game");
      if (slot !== game.turn) {
        throw new functions.https.HttpsError("failed-precondition", "Only setter judges response");
      }
      if (game.phase !== "RESP_JUDGE") {
        throw new functions.https.HttpsError("failed-precondition", "Wrong phase");
      }
      const defenderSlot = opponentSlot(slot);
      const defender = game.players[defenderSlot];
      const historyEntry: GameHistoryEntry = {
        by: slot,
        setPath: game.current?.setVideoPath ?? null,
        respPath: game.current?.responseVideoPath ?? null
      };
      if (approve) {
        appendHistory(tx, ref, { ...historyEntry, result: "landed" });
        tx.update(ref, {
          phase: "SET_RECORD",
          turn: defenderSlot,
          current: {
            by: defenderSlot,
            setVideoPath: null,
            responseVideoPath: null
          }
        });
      } else {
        const nextLetters = (defender?.letters ?? 0) + 1;
        const updates: UpdateData<GameDoc> = {
          phase: "SET_RECORD",
          [`players.${defenderSlot}.letters`]: nextLetters,
          current: {
            by: slot,
            setVideoPath: null,
            responseVideoPath: null
          }
        };
        if (nextLetters >= 3) {
          (updates as UpdateData<GameDoc> & { winner?: string }).winner = game.players[slot].uid;
        }
        appendHistory(tx, ref, { ...historyEntry, result: "failed" });
        tx.update(ref, updates);
      }
    });
    return { ok: true };
  });

export const selfFailSet = functions
  .region("us-central1")
  .runWith({ maxInstances: 40 })
  .https.onCall(async (data: { gameId?: string }, context) => {
    const uid = ensureAuth(context);
    const { gameId } = data;
    if (!gameId) {
      throw new functions.https.HttpsError("invalid-argument", "Missing params");
    }
    await withGame(gameId, async (game, tx, ref) => {
      const slot = getPlayerSlot(game, uid);
      if (!slot) throw new functions.https.HttpsError("permission-denied", "Not part of this game");
      if (slot !== game.turn) {
        throw new functions.https.HttpsError("failed-precondition", "Not setter");
      }
      if (game.phase !== "SET_RECORD") {
        throw new functions.https.HttpsError("failed-precondition", "Wrong phase");
      }
      const nextTurn = opponentSlot(slot);
      appendHistory(tx, ref, {
        by: slot,
        setPath: game.current?.setVideoPath ?? null,
        result: "declined_set"
      });
      tx.update(ref, {
        phase: "SET_RECORD",
        turn: nextTurn,
        current: {
          by: nextTurn,
          setVideoPath: null,
          responseVideoPath: null
        }
      });
    });
    return { ok: true };
  });

export const selfFailResp = functions
  .region("us-central1")
  .runWith({ maxInstances: 40 })
  .https.onCall(async (data: { gameId?: string }, context) => {
    const uid = ensureAuth(context);
    const { gameId } = data;
    if (!gameId) {
      throw new functions.https.HttpsError("invalid-argument", "Missing params");
    }
    await withGame(gameId, async (game, tx, ref) => {
      const slot = getPlayerSlot(game, uid);
      if (!slot) throw new functions.https.HttpsError("permission-denied", "Not part of this game");
      if (slot === game.turn) {
        throw new functions.https.HttpsError("failed-precondition", "Setter cannot self-fail response");
      }
      if (game.phase !== "RESP_RECORD") {
        throw new functions.https.HttpsError("failed-precondition", "Wrong phase");
      }
      const nextLetters = (game.players[slot]?.letters ?? 0) + 1;
      const updates: UpdateData<GameDoc> = {
        phase: "SET_RECORD",
        [`players.${slot}.letters`]: nextLetters,
        current: {
          by: game.turn,
          setVideoPath: null,
          responseVideoPath: null
        }
      };
      if (nextLetters >= 3) {
        (updates as UpdateData<GameDoc> & { winner?: string }).winner = game.players[game.turn].uid;
      }
      appendHistory(tx, ref, {
        by: game.turn,
        setPath: game.current?.setVideoPath ?? null,
        result: "failed"
      });
      tx.update(ref, updates);
    });
    return { ok: true };
  });

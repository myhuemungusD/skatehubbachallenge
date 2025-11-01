import * as admin from 'firebase-admin';
import { setGlobalOptions, logger } from 'firebase-functions/v2';
import {
  CallableRequest,
  HttpsError,
  onCall,
} from 'firebase-functions/v2/https';
import { captureException, flush } from './sentry';
import { z } from 'zod';
import {
  GameState,
  HistoryEntry,
  HistoryResult,
  PlayerSlot,
  RateLimitDoc,
} from './types';

setGlobalOptions({
  region: 'us-central1',
  timeoutSeconds: 60,
  memory: '512MiB',
  maxInstances: 50,
});

if (admin.apps.length === 0) {
  admin.initializeApp();
}

const db = admin.firestore();
const LETTER_SEQUENCE = ['S', 'K', '8'];
const RATE_LIMIT_WINDOW_MS = Number(process.env.RATE_LIMIT_WINDOW_MS ?? 60_000);
const RATE_LIMIT_REQUESTS = Number(process.env.RATE_LIMIT_REQUESTS ?? 30);

const nameSchema = z
  .string()
  .trim()
  .min(2, 'Display name must be at least 2 characters.')
  .max(50, 'Display name must be 50 characters or less.');

const codeSchema = z
  .string()
  .trim()
  .length(6, 'Game code must be exactly 6 characters.')
  .regex(/^[A-Z0-9]{6}$/);

const gameIdSchema = z.string().trim().min(1);

const storagePathSchema = z
  .string()
  .trim()
  .min(1)
  .regex(/^games\/[A-Za-z0-9/_-]+\.(mp4|mov|webm)$/i, 'Invalid storage path.');

type GameTransaction<T> = (gameRef: FirebaseFirestore.DocumentReference<GameState>, data: GameState) => T;

type EnforceRateLimitArgs = {
  request: CallableRequest<unknown>;
  functionName: string;
};

type CallableHandler<T = unknown> = (request: CallableRequest<unknown>) => Promise<T> | T;

function withSentry<T>(handler: CallableHandler<T>): CallableHandler<T> {
  return async (request) => {
    try {
      return await handler(request);
    } catch (error) {
      await captureException(error, {
        userId: request.auth?.uid,
        extra: {
          functionName: handler.name || 'callable',
        },
      });
      await flush(2000);
      throw error;
    }
  };
}

async function enforceRateLimit({ request, functionName }: EnforceRateLimitArgs) {
  const uid = request.auth?.uid ?? 'anonymous';
  const ipHeader =
    (typeof request.rawRequest?.headers?.['x-forwarded-for'] === 'string'
      ? request.rawRequest?.headers?.['x-forwarded-for']
      : Array.isArray(request.rawRequest?.headers?.['x-forwarded-for'])
      ? request.rawRequest?.headers?.['x-forwarded-for'][0]
      : undefined) ?? request.rawRequest?.ip ?? 'unknown';

  const ip = ipHeader.split(',')[0]?.trim() ?? 'unknown';
  const key = `uid:${uid}|ip:${ip}|fn:${functionName}`;
  const docId = key.replace(/[^A-Za-z0-9_-]/g, '_');
  const rateRef = db.collection('rateLimits').doc(docId);
  const now = Date.now();

  await db.runTransaction(async (tx) => {
    const snap = await tx.get(rateRef);
    let count = 0;
    let windowStartMs = now;

    if (snap.exists) {
      const data = snap.data() as Partial<RateLimitDoc> & { windowStart?: FirebaseFirestore.Timestamp };
      if (data.windowStart) {
        const candidate = data.windowStart.toMillis();
        if (now - candidate < RATE_LIMIT_WINDOW_MS) {
          windowStartMs = candidate;
          count = typeof data.count === 'number' ? data.count : 0;
        }
      }
    }

    if (now - windowStartMs >= RATE_LIMIT_WINDOW_MS) {
      windowStartMs = now;
      count = 0;
    }

    if (count + 1 > RATE_LIMIT_REQUESTS) {
      throw new HttpsError('resource-exhausted', 'Too many requests. Please slow down.');
    }

    tx.set(
      rateRef,
      {
        count: count + 1,
        windowStart: admin.firestore.Timestamp.fromMillis(windowStartMs),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        lastUid: uid,
        lastIp: ip,
      },
      { merge: true },
    );
  });
}

function requireAuth(request: CallableRequest<unknown>): string {
  const uid = request.auth?.uid;
  if (!uid) {
    throw new HttpsError('unauthenticated', 'Authentication is required.');
  }
  return uid;
}

function otherSlot(slot: PlayerSlot): PlayerSlot {
  return slot === 'A' ? 'B' : 'A';
}

function getPlayerSlot(game: GameState, uid: string): PlayerSlot | null {
  if (game.players.A?.uid === uid) {
    return 'A';
  }
  if (game.players.B?.uid === uid) {
    return 'B';
  }
  return null;
}

function ensureParticipant(game: GameState, uid: string): PlayerSlot {
  const slot = getPlayerSlot(game, uid);
  if (!slot) {
    throw new HttpsError('permission-denied', 'You are not part of this game.');
  }
  return slot;
}

function assertPhase(game: GameState, phase: GameState['phase']) {
  if (game.phase !== phase) {
    throw new HttpsError('failed-precondition', `Game is not in the ${phase} phase.`);
  }
}

function assertWinnerNotDeclared(game: GameState) {
  if (game.winner) {
    throw new HttpsError('failed-precondition', 'Game has already finished.');
  }
}

function appendHistory(game: GameState, entry: Omit<HistoryEntry, 'ts'> & { ts?: FirebaseFirestore.Timestamp }) {
  const ts = entry.ts ?? admin.firestore.Timestamp.now();
  game.history = [...(game.history ?? []), { ...entry, ts }];
}

function overwriteLastHistory(game: GameState, entry: Partial<HistoryEntry> & { result: HistoryResult }) {
  if (!game.history || game.history.length === 0) {
    throw new HttpsError('internal', 'History is out of sync.');
  }
  const existing = game.history[game.history.length - 1];
  game.history = [
    ...game.history.slice(0, -1),
    {
      ...existing,
      ...entry,
      result: entry.result,
      ts: entry.ts ?? existing.ts ?? admin.firestore.Timestamp.now(),
    },
  ];
}

function addLetter(currentLetters: string): { letters: string; eliminated: boolean } {
  const existing = currentLetters ?? '';
  if (existing.length >= LETTER_SEQUENCE.length) {
    return { letters: existing, eliminated: true };
  }
  const nextLetter = LETTER_SEQUENCE[existing.length];
  const updated = `${existing}${nextLetter}`;
  return { letters: updated, eliminated: updated.length >= LETTER_SEQUENCE.length };
}

async function runGameTransaction<T>(
  gameId: string,
  handler: GameTransaction<Promise<T> | T>,
): Promise<T> {
  const gameRef = db.collection('games').doc(gameId) as FirebaseFirestore.DocumentReference<GameState>;
  return db.runTransaction(async (tx) => {
    const snapshot = await tx.get(gameRef);
    if (!snapshot.exists) {
      throw new HttpsError('not-found', 'Game not found.');
    }

    const data = snapshot.data() as GameState;
    const result = await handler(gameRef, data);
    tx.update(gameRef, {
      ...data,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    return result;
  });
}

async function ensureUniqueCode(): Promise<{ code: string; gameRef: FirebaseFirestore.DocumentReference<GameState> }> {
  const attempts = 10;
  const alphabet = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
  for (let i = 0; i < attempts; i += 1) {
    const code = Array.from({ length: 6 }, () => alphabet.charAt(Math.floor(Math.random() * alphabet.length))).join('');
    const existing = await db.collection('games').where('code', '==', code).limit(1).get();
    if (existing.empty) {
      const gameRef = db.collection('games').doc() as FirebaseFirestore.DocumentReference<GameState>;
      return { code, gameRef };
    }
  }
  throw new HttpsError('resource-exhausted', 'Unable to allocate game code. Please try again.');
}

const createGameHandler = onCall(withSentry(async (request) => {
  await enforceRateLimit({ request, functionName: 'createGame' });
  const uid = requireAuth(request);
  const name = nameSchema.parse(request.data?.name);

  const { code, gameRef } = await ensureUniqueCode();

  await db.runTransaction(async (tx) => {
    const now = admin.firestore.FieldValue.serverTimestamp();
    tx.set(gameRef, {
      code,
      turn: 'A',
      phase: 'SET_RECORD',
      players: {
        A: { uid, name, letters: '' },
        B: { uid: '', name: '', letters: '' },
      },
      current: { by: 'A' },
      history: [],
      createdAt: now,
      updatedAt: now,
    } as unknown as GameState);
  });

  logger.info('Game created', { uid, gameId: gameRef.id, code });
  return { gameId: gameRef.id, code };
}));

const joinGameHandler = onCall(withSentry(async (request) => {
  await enforceRateLimit({ request, functionName: 'joinGame' });
  const uid = requireAuth(request);
  const name = nameSchema.parse(request.data?.name);
  const code = codeSchema.parse(request.data?.code);

  const snapshot = await db.collection('games').where('code', '==', code).limit(1).get();
  if (snapshot.empty) {
    throw new HttpsError('not-found', 'Game code not found.');
  }

  const doc = snapshot.docs[0];
  const gameRef = doc.ref as FirebaseFirestore.DocumentReference<GameState>;

  await db.runTransaction(async (tx) => {
    const snap = await tx.get(gameRef);
    if (!snap.exists) {
      throw new HttpsError('not-found', 'Game not found.');
    }
    const data = snap.data() as GameState;
    assertWinnerNotDeclared(data);

    if (data.players.B?.uid && data.players.B.uid !== uid) {
      throw new HttpsError('failed-precondition', 'Game already has two players.');
    }
    if (data.players.A?.uid === uid) {
      logger.info('Player rejoining as slot A', { uid, gameId: gameRef.id });
      data.players.A = { ...data.players.A, name };
    } else {
      data.players.B = { uid, name, letters: data.players.B?.letters ?? '' };
    }
    tx.update(gameRef, {
      players: data.players,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
  });

  logger.info('Player joined game', { uid, gameId: gameRef.id });
  return { gameId: gameRef.id };
}));

const submitSetClipHandler = onCall(withSentry(async (request) => {
  await enforceRateLimit({ request, functionName: 'submitSetClip' });
  const uid = requireAuth(request);
  const gameId = gameIdSchema.parse(request.data?.gameId);
  const storagePath = storagePathSchema.parse(request.data?.storagePath);

  await runGameTransaction(gameId, async (_gameRef, game) => {
    assertWinnerNotDeclared(game);
    assertPhase(game, 'SET_RECORD');
    const slot = ensureParticipant(game, uid);
    if (slot !== game.current.by || slot !== game.turn) {
      throw new HttpsError('failed-precondition', 'It is not your turn to set.');
    }
    if (game.current.setVideoPath) {
      throw new HttpsError('failed-precondition', 'Set clip already submitted.');
    }

    const responder = otherSlot(slot);
    game.current = {
      by: slot,
      responder,
      setVideoPath: storagePath,
    };
    game.phase = 'SET_JUDGE';
    return null;
  });

  logger.info('Set clip submitted', { uid, gameId });
  return { ok: true };
}));

const judgeSetHandler = onCall(withSentry(async (request) => {
  await enforceRateLimit({ request, functionName: 'judgeSet' });
  const uid = requireAuth(request);
  const gameId = gameIdSchema.parse(request.data?.gameId);
  const approve = z.boolean().parse(request.data?.approve);

  await runGameTransaction(gameId, async (_gameRef, game) => {
    assertWinnerNotDeclared(game);
    assertPhase(game, 'SET_JUDGE');
    const slot = ensureParticipant(game, uid);
    const shooter = game.current.by;
    const opponent = otherSlot(shooter);
    if (slot !== opponent) {
      throw new HttpsError('permission-denied', 'Only the opponent can judge the set.');
    }
    if (!game.current.setVideoPath) {
      throw new HttpsError('failed-precondition', 'Set video missing.');
    }

    if (approve) {
      appendHistory(game, {
        by: shooter,
        setPath: game.current.setVideoPath,
        result: 'approved_set',
      });
      game.phase = 'RESP_RECORD';
      game.current = {
        ...game.current,
        responder: opponent,
      };
    } else {
      appendHistory(game, {
        by: shooter,
        setPath: game.current.setVideoPath,
        result: 'declined_set',
      });
      game.phase = 'SET_RECORD';
      game.current = { by: shooter };
    }
    return null;
  });

  logger.info('Set judged', { uid, gameId, approve });
  return { ok: true };
}));

const submitRespClipHandler = onCall(withSentry(async (request) => {
  await enforceRateLimit({ request, functionName: 'submitRespClip' });
  const uid = requireAuth(request);
  const gameId = gameIdSchema.parse(request.data?.gameId);
  const storagePath = storagePathSchema.parse(request.data?.storagePath);

  await runGameTransaction(gameId, async (_gameRef, game) => {
    assertWinnerNotDeclared(game);
    assertPhase(game, 'RESP_RECORD');
    const slot = ensureParticipant(game, uid);
    const responder = game.current.responder;
    if (!responder || slot !== responder) {
      throw new HttpsError('failed-precondition', 'It is not your turn to respond.');
    }
    if (game.current.responseVideoPath) {
      throw new HttpsError('failed-precondition', 'Response already submitted.');
    }

    game.current = {
      ...game.current,
      responseVideoPath: storagePath,
    };
    game.phase = 'RESP_JUDGE';
    return null;
  });

  logger.info('Response submitted', { uid, gameId });
  return { ok: true };
}));

const judgeRespHandler = onCall(withSentry(async (request) => {
  await enforceRateLimit({ request, functionName: 'judgeResp' });
  const uid = requireAuth(request);
  const gameId = gameIdSchema.parse(request.data?.gameId);
  const approve = z.boolean().parse(request.data?.approve);

  await runGameTransaction(gameId, async (_gameRef, game) => {
    assertWinnerNotDeclared(game);
    assertPhase(game, 'RESP_JUDGE');
    const slot = ensureParticipant(game, uid);
    const shooter = game.current.by;
    if (slot !== shooter) {
      throw new HttpsError('permission-denied', 'Only the shooter can judge the response.');
    }

    const responder = game.current.responder ?? otherSlot(shooter);
    if (!game.history.length || game.history[game.history.length - 1].result !== 'approved_set') {
      throw new HttpsError('failed-precondition', 'Set has not been approved.');
    }

    if (approve && !game.current.responseVideoPath) {
      throw new HttpsError('failed-precondition', 'Response video missing.');
    }

    if (approve) {
      overwriteLastHistory(game, {
        result: 'landed',
        respPath: game.current.responseVideoPath,
        ts: admin.firestore.Timestamp.now(),
      });
    } else {
      const defender = responder;
      const currentLetters = game.players[defender]?.letters ?? '';
      const { letters, eliminated } = addLetter(currentLetters);
      game.players[defender] = {
        ...game.players[defender],
        letters,
      };
      overwriteLastHistory(game, {
        result: 'failed',
        respPath: game.current.responseVideoPath,
        ts: admin.firestore.Timestamp.now(),
      });
      if (eliminated) {
        game.winner = shooter;
      }
    }

    const nextShooter = otherSlot(shooter);
    game.turn = nextShooter;
    game.phase = 'SET_RECORD';
    game.current = { by: nextShooter };
    return null;
  });

  logger.info('Response judged', { uid, gameId, approve });
  return { ok: true };
}));

const selfFailSetHandler = onCall(withSentry(async (request) => {
  await enforceRateLimit({ request, functionName: 'selfFailSet' });
  const uid = requireAuth(request);
  const gameId = gameIdSchema.parse(request.data?.gameId);

  await runGameTransaction(gameId, async (_gameRef, game) => {
    assertWinnerNotDeclared(game);
    assertPhase(game, 'SET_RECORD');
    const slot = ensureParticipant(game, uid);
    if (slot !== game.current.by || slot !== game.turn) {
      throw new HttpsError('failed-precondition', 'It is not your turn.');
    }

    appendHistory(game, {
      by: slot,
      result: 'failed',
    });

    const nextShooter = otherSlot(slot);
    game.turn = nextShooter;
    game.phase = 'SET_RECORD';
    game.current = { by: nextShooter };
    return null;
  });

  logger.info('Self fail set', { uid, gameId });
  return { ok: true };
}));

const selfFailRespHandler = onCall(withSentry(async (request) => {
  await enforceRateLimit({ request, functionName: 'selfFailResp' });
  const uid = requireAuth(request);
  const gameId = gameIdSchema.parse(request.data?.gameId);

  await runGameTransaction(gameId, async (_gameRef, game) => {
    assertWinnerNotDeclared(game);
    if (game.phase !== 'RESP_RECORD' && game.phase !== 'RESP_JUDGE') {
      throw new HttpsError('failed-precondition', 'No response in progress.');
    }
    const slot = ensureParticipant(game, uid);
    const shooter = game.current.by;
    const responder = game.current.responder ?? otherSlot(shooter);
    if (slot !== responder) {
      throw new HttpsError('failed-precondition', 'Only the responder can self-fail.');
    }
    if (!game.history.length || game.history[game.history.length - 1].result !== 'approved_set') {
      throw new HttpsError('failed-precondition', 'Set has not been approved.');
    }

    const currentLetters = game.players[slot]?.letters ?? '';
    const { letters, eliminated } = addLetter(currentLetters);
    game.players[slot] = {
      ...game.players[slot],
      letters,
    };
    overwriteLastHistory(game, {
      result: 'failed',
      respPath: game.current.responseVideoPath,
      ts: admin.firestore.Timestamp.now(),
    });

    if (eliminated) {
      game.winner = shooter;
    }

    const nextShooter = otherSlot(shooter);
    game.turn = nextShooter;
    game.phase = 'SET_RECORD';
    game.current = { by: nextShooter };
    return null;
  });

  logger.info('Self fail response', { uid, gameId });
  return { ok: true };
}));
export const createGame = createGameHandler;
export const joinGame = joinGameHandler;
export const submitSetClip = submitSetClipHandler;
export const judgeSet = judgeSetHandler;
export const submitRespClip = submitRespClipHandler;
export const judgeResp = judgeRespHandler;
export const selfFailSet = selfFailSetHandler;
export const selfFailResp = selfFailRespHandler;

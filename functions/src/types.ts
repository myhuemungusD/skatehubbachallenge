export type PlayerSlot = 'A' | 'B';

export type Phase = 'SET_RECORD' | 'SET_JUDGE' | 'RESP_RECORD' | 'RESP_JUDGE';

export type HistoryResult =
  | 'declined_set'
  | 'approved_set'
  | 'landed'
  | 'failed';

export interface PlayerState {
  uid: string;
  name: string;
  letters: string;
}

export interface HistoryEntry {
  by: PlayerSlot;
  setPath?: string;
  respPath?: string;
  result: HistoryResult;
  ts: FirebaseFirestore.Timestamp;
}

export interface CurrentRoundState {
  by: PlayerSlot;
  responder?: PlayerSlot;
  setVideoPath?: string;
  responseVideoPath?: string;
}

export interface GameState {
  code: string;
  turn: PlayerSlot;
  phase: Phase;
  winner?: PlayerSlot;
  players: Record<PlayerSlot, PlayerState>;
  current: CurrentRoundState;
  history: HistoryEntry[];
  createdAt: FirebaseFirestore.Timestamp;
  updatedAt: FirebaseFirestore.Timestamp;
}

export interface RateLimitDoc {
  count: number;
  windowStart: FirebaseFirestore.Timestamp;
  updatedAt: FirebaseFirestore.Timestamp;
}

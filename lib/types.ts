export type PlayerSlot = "A" | "B";
export type Phase = "SET_RECORD" | "SET_JUDGE" | "RESP_RECORD" | "RESP_JUDGE";

export interface PlayerState {
  uid: string;
  name: string;
  letters: number;
}

export interface GameHistoryEntry {
  by: PlayerSlot;
  setPath?: string;
  respPath?: string;
  result: "declined_set" | "approved_set" | "landed" | "failed";
  ts: string;
}

export interface CurrentRoundState {
  by: PlayerSlot;
  setVideoPath?: string;
  responseVideoPath?: string;
}

export interface GameState {
  id: string;
  code: string;
  turn: PlayerSlot;
  phase: Phase;
  winner?: string | null;
  players: Record<PlayerSlot, PlayerState>;
  current: CurrentRoundState;
  history: GameHistoryEntry[];
}

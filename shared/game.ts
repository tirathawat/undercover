import type { MessageMetadata } from './messages';

export type Category = 'mix' | 'food' | 'places' | 'things';
export type Phase =
  'lobby' | 'reveal' | 'clue' | 'vote' | 'guess' | 'result' | 'finished';
export type Role = 'civilian' | 'undercover' | 'whiteGuy';
export type WinningTeam = Role | 'infiltrators';

export interface Settings {
  category: Category;
  undercovers: number;
  whiteGuys: number;
}

export interface PublicPlayer {
  id: string;
  name: string;
  avatar: number;
  connected: boolean;
  alive: boolean;
  ready: boolean;
  role?: Role;
}

export interface HistoryEntry extends MessageMetadata {
  id: string;
  game: number;
  round: number;
  playerId: string;
  name: string;
  avatar: number;
  text: string;
  time: number;
}

export interface VoteResult {
  eliminatedId: string | null;
  role: Role | null;
  counts: Record<string, number>;
  tiedIds: string[];
  guess?: { text: string; correct: boolean };
}

export interface RoomView {
  code: string;
  hostId: string;
  stageId: string;
  phase: Phase;
  game: number;
  round: number;
  settings: Settings;
  players: PublicPlayer[];
  self: { id: string; word: string | null; hasVoted: boolean; role?: Role };
  speakerId: string | null;
  voteCount: number;
  voteCandidates: string[];
  result: VoteResult | null;
  winner: WinningTeam | null;
  words: { civilian: string; undercover: string } | null;
  history: HistoryEntry[];
}

export interface Session {
  code: string;
  playerId: string;
  token: string;
}

export type GameAction =
  | { type: 'create'; name: string; avatar: number; pin: string }
  | { type: 'join'; code: string; name: string; avatar: number; pin: string }
  | { type: 'recover'; code: string; name: string; pin: string }
  | { type: 'resume'; code: string; token: string }
  | { type: 'settings'; stageId: string; settings: Settings }
  | {
      type:
        | 'start'
        | 'ready'
        | 'skip'
        | 'finishVote'
        | 'next'
        | 'rematch'
        | 'skipGuess';
      stageId: string;
    }
  | { type: 'clue'; stageId: string; text: string }
  | { type: 'guess'; stageId: string; text: string }
  | { type: 'vote'; stageId: string; targetId: string }
  | { type: 'remove'; stageId: string; targetId: string }
  | { type: 'leave' };

export type ActionReply =
  | { ok: true; session?: Session; room?: RoomView }
  | (MessageMetadata & {
      ok: false;
      error: string;
      code: 'INVALID' | 'SESSION' | 'GAME' | 'LIMIT';
    });

export const categories: { value: Category; emoji: string }[] = [
  { value: 'mix', emoji: '🎲' },
  { value: 'food', emoji: '🍜' },
  { value: 'places', emoji: '🏝️' },
  { value: 'things', emoji: '🪴' },
];

export const avatars = [
  '🦊',
  '🐸',
  '🐻',
  '🐰',
  '🐱',
  '🐼',
  '🐙',
  '🐯',
  '🐨',
  '🐧',
  '🦁',
  '🐵',
];

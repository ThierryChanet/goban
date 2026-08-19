import type { GameConfig, GameSnapshot } from './game.js';
import type { Color } from './goban.js';

export type Seat = Color | 'observer';

export interface PlayerInfo {
  name: string;
  connected: boolean;
  /** Vrai tant que personne n'a pris la place. */
  open: boolean;
}

export interface RoomSnapshot {
  roomId: string;
  game: GameSnapshot;
  players: { black: PlayerInfo; white: PlayerInfo };
  observers: number;
  rematch: { black: boolean; white: boolean };
}

export type ClientMessage =
  | { type: 'create'; token: string; name?: string; config: Partial<GameConfig>; seatPreference?: Color | 'random' }
  | { type: 'join'; token: string; name?: string; roomId: string }
  | { type: 'move'; point: number }
  | { type: 'pass' }
  | { type: 'resign' }
  | { type: 'toggleDead'; point: number }
  | { type: 'confirmScore' }
  | { type: 'resumePlay' }
  | { type: 'rematch' }
  | { type: 'leave' }
  | { type: 'ping' };

export type ServerErrorCode =
  | 'room_not_found'
  | 'room_full'
  | 'not_seated'
  | 'not_in_room'
  | 'bad_message'
  | 'not_your_turn'
  | 'occupied'
  | 'suicide'
  | 'ko'
  | 'out_of_bounds'
  | 'wrong_phase'
  | 'not_a_stone'
  | 'rate_limited'
  | 'server_error';

export type ServerMessage =
  | { type: 'joined'; roomId: string; seat: Seat; snapshot: RoomSnapshot }
  | { type: 'state'; seat: Seat; snapshot: RoomSnapshot }
  | { type: 'error'; code: ServerErrorCode }
  | { type: 'pong' };

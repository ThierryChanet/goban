import { randomBytes } from 'node:crypto';
import { GoGame, normalizeConfig, type GameConfig } from '../shared/game.js';
import type { Color } from '../shared/goban.js';
import type { PlayerInfo, RoomSnapshot, Seat } from '../shared/protocol.js';

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // sans I, O, 0, 1
const CODE_LENGTH = 5;
const ROOM_TTL_MS = 6 * 60 * 60 * 1000; // 6 h sans activite

export interface Connection {
  id: string;
  send(payload: unknown): void;
  close(): void;
}

interface PlayerSlot {
  token: string | null;
  name: string;
  connections: Set<Connection>;
  rematch: boolean;
}

function emptySlot(): PlayerSlot {
  return { token: null, name: '', connections: new Set(), rematch: false };
}

export function generateRoomCode(): string {
  const bytes = randomBytes(CODE_LENGTH);
  let out = '';
  for (let i = 0; i < CODE_LENGTH; i++) {
    out += CODE_ALPHABET[bytes[i] % CODE_ALPHABET.length];
  }
  return out;
}

export class Room {
  game: GoGame;
  readonly slots: Record<Color, PlayerSlot> = { black: emptySlot(), white: emptySlot() };
  readonly observers = new Set<Connection>();
  lastActivity = Date.now();

  constructor(
    readonly id: string,
    config: GameConfig,
  ) {
    this.game = new GoGame(config);
  }

  seatOf(token: string): Color | null {
    if (this.slots.black.token === token) return 'black';
    if (this.slots.white.token === token) return 'white';
    return null;
  }

  seatOfConnection(connection: Connection): Seat {
    if (this.slots.black.connections.has(connection)) return 'black';
    if (this.slots.white.connections.has(connection)) return 'white';
    return 'observer';
  }

  /** Assoc(ie une connexion a une place : reconnexion, place libre, sinon observateur. */
  attach(connection: Connection, token: string, name: string): Seat {
    this.lastActivity = Date.now();

    const existing = this.seatOf(token);
    if (existing) {
      const slot = this.slots[existing];
      slot.connections.add(connection);
      if (name) slot.name = name;
      return existing;
    }

    for (const color of ['black', 'white'] as const) {
      const slot = this.slots[color];
      if (slot.token === null) {
        slot.token = token;
        slot.name = name;
        slot.connections.add(connection);
        return color;
      }
    }

    this.observers.add(connection);
    return 'observer';
  }

  /** Reserve une place a la creation de la partie. */
  claimSeat(color: Color, token: string, name: string): void {
    const slot = this.slots[color];
    slot.token = token;
    slot.name = name;
  }

  detach(connection: Connection): void {
    this.slots.black.connections.delete(connection);
    this.slots.white.connections.delete(connection);
    this.observers.delete(connection);
    this.lastActivity = Date.now();
  }

  get connectionCount(): number {
    return this.slots.black.connections.size + this.slots.white.connections.size + this.observers.size;
  }

  get isStale(): boolean {
    return this.connectionCount === 0 && Date.now() - this.lastActivity > ROOM_TTL_MS;
  }

  setRematch(color: Color, value: boolean): void {
    this.slots[color].rematch = value;
    if (this.slots.black.rematch && this.slots.white.rematch) {
      this.startRematch();
    }
  }

  /** Nouvelle partie, memes reglages, couleurs echangees. */
  private startRematch(): void {
    const config = this.game.config;
    const black = this.slots.black;
    const white = this.slots.white;

    const blackToken = black.token;
    const blackName = black.name;
    const blackConnections = new Set(black.connections);

    black.token = white.token;
    black.name = white.name;
    black.connections.clear();
    for (const c of white.connections) black.connections.add(c);

    white.token = blackToken;
    white.name = blackName;
    white.connections.clear();
    for (const c of blackConnections) white.connections.add(c);

    black.rematch = false;
    white.rematch = false;
    this.game = new GoGame(config);
  }

  snapshot(): RoomSnapshot {
    return {
      roomId: this.id,
      game: this.game.snapshot(),
      players: {
        black: playerInfo(this.slots.black),
        white: playerInfo(this.slots.white),
      },
      observers: this.observers.size,
      rematch: { black: this.slots.black.rematch, white: this.slots.white.rematch },
    };
  }

  allConnections(): Connection[] {
    return [...this.slots.black.connections, ...this.slots.white.connections, ...this.observers];
  }
}

function playerInfo(slot: PlayerSlot): PlayerInfo {
  return {
    name: slot.name,
    connected: slot.connections.size > 0,
    open: slot.token === null,
  };
}

export class RoomStore {
  private rooms = new Map<string, Room>();

  create(rawConfig: Partial<GameConfig> | undefined): Room {
    const config = normalizeConfig(rawConfig);
    let id = generateRoomCode();
    while (this.rooms.has(id)) id = generateRoomCode();
    const room = new Room(id, config);
    this.rooms.set(id, room);
    return room;
  }

  get(id: string): Room | undefined {
    return this.rooms.get(id.trim().toUpperCase());
  }

  get size(): number {
    return this.rooms.size;
  }

  /** Supprime les parties inactives depuis longtemps. */
  sweep(): number {
    let removed = 0;
    for (const [id, room] of this.rooms) {
      if (room.isStale) {
        this.rooms.delete(id);
        removed++;
      }
    }
    return removed;
  }
}

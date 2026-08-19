import type { ClientMessage, RoomSnapshot, Seat, ServerMessage } from '../shared/protocol.js';
import type { GameConfig } from '../shared/game.js';
import type { Color } from '../shared/goban.js';

export type NetStatus = 'connecting' | 'open' | 'closed';

interface Handlers {
  onStatus(status: NetStatus): void;
  onJoined(roomId: string, seat: Seat, snapshot: RoomSnapshot): void;
  onState(seat: Seat, snapshot: RoomSnapshot): void;
  onError(code: string): void;
}

function socketUrl(): string {
  const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${protocol}//${location.host}/ws`;
}

/**
 * Connexion au serveur de parties, avec reconnexion automatique :
 * la place du joueur est retrouvee grace au jeton stocke dans le navigateur.
 */
export class GoClient {
  private socket: WebSocket | null = null;
  private pending: ClientMessage[] = [];
  private retryDelay = 500;
  private closedByUser = false;
  private roomId: string | null = null;
  private pendingCreate: ClientMessage | null = null;

  constructor(
    private readonly token: string,
    private name: string,
    private readonly handlers: Handlers,
  ) {}

  setName(name: string): void {
    this.name = name;
  }

  connect(): void {
    this.closedByUser = false;
    this.handlers.onStatus(this.socket ? 'connecting' : 'connecting');
    const socket = new WebSocket(socketUrl());
    this.socket = socket;

    socket.addEventListener('open', () => {
      this.retryDelay = 500;
      this.handlers.onStatus('open');
      if (this.pendingCreate) {
        const message = this.pendingCreate;
        this.pendingCreate = null;
        this.rawSend(message);
      } else if (this.roomId) {
        this.rawSend({ type: 'join', token: this.token, name: this.name, roomId: this.roomId });
      }
      const queued = this.pending;
      this.pending = [];
      for (const message of queued) this.rawSend(message);
    });

    socket.addEventListener('message', (event) => {
      let message: ServerMessage;
      try {
        message = JSON.parse(String(event.data)) as ServerMessage;
      } catch {
        return;
      }
      switch (message.type) {
        case 'joined':
          this.roomId = message.roomId;
          this.handlers.onJoined(message.roomId, message.seat, message.snapshot);
          break;
        case 'state':
          this.handlers.onState(message.seat, message.snapshot);
          break;
        case 'error':
          this.handlers.onError(message.code);
          break;
        default:
          break;
      }
    });

    socket.addEventListener('close', () => {
      this.socket = null;
      this.handlers.onStatus('closed');
      if (this.closedByUser) return;
      setTimeout(() => this.connect(), this.retryDelay);
      this.retryDelay = Math.min(this.retryDelay * 2, 10_000);
    });

    socket.addEventListener('error', () => socket.close());
  }

  disconnect(): void {
    this.closedByUser = true;
    this.roomId = null;
    this.socket?.close();
    this.socket = null;
  }

  createGame(config: Partial<GameConfig>, seatPreference: Color | 'random'): void {
    this.roomId = null;
    const message: ClientMessage = {
      type: 'create',
      token: this.token,
      name: this.name,
      config,
      seatPreference,
    };
    if (this.isOpen) this.rawSend(message);
    else this.pendingCreate = message;
  }

  joinGame(roomId: string): void {
    this.roomId = roomId.trim().toUpperCase();
    this.send({ type: 'join', token: this.token, name: this.name, roomId: this.roomId });
  }

  leaveGame(): void {
    if (this.roomId) this.send({ type: 'leave' });
    this.roomId = null;
  }

  send(message: ClientMessage): void {
    if (this.isOpen) this.rawSend(message);
    else this.pending.push(message);
  }

  private get isOpen(): boolean {
    return this.socket !== null && this.socket.readyState === WebSocket.OPEN;
  }

  private rawSend(message: ClientMessage): void {
    this.socket?.send(JSON.stringify(message));
  }
}

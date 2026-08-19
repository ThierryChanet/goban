import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { existsSync } from 'node:fs';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { WebSocketServer, type WebSocket } from 'ws';
import { RuleError } from '../shared/game.js';
import type { Color } from '../shared/goban.js';
import type { ClientMessage, ServerErrorCode, ServerMessage } from '../shared/protocol.js';
import { RoomStore, type Connection, type Room } from './rooms.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT ?? 8787);
const HOST = process.env.HOST ?? '0.0.0.0';

const CLIENT_DIR = [
  resolve(HERE, '../../client'), // build : dist/server/server -> dist/client
  resolve(HERE, '../../../dist/client'), // dev via tsx : src/server -> dist/client
].find((candidate) => existsSync(join(candidate, 'index.html')));

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.webmanifest': 'application/manifest+json',
};

const store = new RoomStore();
setInterval(() => store.sweep(), 15 * 60 * 1000).unref();

const httpServer = createServer(handleHttp);
const wss = new WebSocketServer({ server: httpServer, path: '/ws' });

interface Session {
  connection: Connection;
  socket: WebSocket;
  room: Room | null;
  token: string;
  name: string;
  alive: boolean;
  messageTimes: number[];
}

const sessions = new Map<WebSocket, Session>();

wss.on('connection', (socket) => {
  const connection: Connection = {
    id: randomUUID(),
    send: (payload) => {
      if (socket.readyState === socket.OPEN) socket.send(JSON.stringify(payload));
    },
    close: () => socket.close(),
  };

  const session: Session = {
    connection,
    socket,
    room: null,
    token: '',
    name: '',
    alive: true,
    messageTimes: [],
  };
  sessions.set(socket, session);

  socket.on('pong', () => {
    session.alive = true;
  });

  socket.on('message', (raw) => {
    let message: ClientMessage;
    try {
      message = JSON.parse(String(raw)) as ClientMessage;
    } catch {
      send(session, { type: 'error', code: 'bad_message' });
      return;
    }
    if (isRateLimited(session)) {
      send(session, { type: 'error', code: 'rate_limited' });
      return;
    }
    try {
      handleMessage(session, message);
    } catch (error) {
      if (error instanceof RuleError) {
        send(session, { type: 'error', code: error.code as ServerErrorCode });
      } else {
        console.error('[ws] erreur inattendue', error);
        send(session, { type: 'error', code: 'server_error' });
      }
    }
  });

  socket.on('close', () => {
    const room = session.room;
    sessions.delete(socket);
    if (room) {
      room.detach(connection);
      broadcast(room);
    }
  });

  socket.on('error', () => socket.terminate());
});

const heartbeat = setInterval(() => {
  for (const [socket, session] of sessions) {
    if (!session.alive) {
      socket.terminate();
      continue;
    }
    session.alive = false;
    socket.ping();
  }
}, 30_000);
heartbeat.unref();

function handleMessage(session: Session, message: ClientMessage): void {
  switch (message.type) {
    case 'ping':
      send(session, { type: 'pong' });
      return;

    case 'create': {
      leaveRoom(session);
      session.token = sanitizeToken(message.token);
      session.name = sanitizeName(message.name);
      const room = store.create(message.config);
      const preference = message.seatPreference;
      const seat: Color =
        preference === 'black' || preference === 'white'
          ? preference
          : Math.random() < 0.5
            ? 'black'
            : 'white';
      room.claimSeat(seat, session.token, session.name);
      const assigned = room.attach(session.connection, session.token, session.name);
      session.room = room;
      send(session, { type: 'joined', roomId: room.id, seat: assigned, snapshot: room.snapshot() });
      console.log(`[room] creation ${room.id} (${room.game.config.size}x${room.game.config.size}) - ${store.size} parties en memoire`);
      return;
    }

    case 'join': {
      const room = store.get(String(message.roomId ?? ''));
      if (!room) {
        send(session, { type: 'error', code: 'room_not_found' });
        return;
      }
      leaveRoom(session);
      session.token = sanitizeToken(message.token);
      session.name = sanitizeName(message.name);
      const seat = room.attach(session.connection, session.token, session.name);
      session.room = room;
      send(session, { type: 'joined', roomId: room.id, seat, snapshot: room.snapshot() });
      broadcast(room);
      return;
    }

    case 'leave':
      leaveRoom(session);
      return;

    default:
      break;
  }

  const room = session.room;
  if (!room) {
    send(session, { type: 'error', code: 'not_in_room' });
    return;
  }
  const seat = room.seatOf(session.token);
  if (!seat) {
    send(session, { type: 'error', code: 'not_seated' });
    return;
  }
  room.lastActivity = Date.now();

  switch (message.type) {
    case 'move':
      room.game.play(seat, Number(message.point));
      break;
    case 'pass':
      room.game.pass(seat);
      break;
    case 'requestCount':
      room.game.requestCount();
      break;
    case 'undo':
      room.game.undo();
      break;
    case 'resign':
      room.game.resign(seat);
      break;
    case 'toggleDead':
      room.game.toggleDead(Number(message.point));
      break;
    case 'confirmScore':
      room.game.confirmScore(seat);
      break;
    case 'resumePlay':
      room.game.resumePlay();
      break;
    case 'rematch':
      if (room.game.phase !== 'finished') {
        send(session, { type: 'error', code: 'wrong_phase' });
        return;
      }
      room.setRematch(seat, true);
      break;
    default:
      send(session, { type: 'error', code: 'bad_message' });
      return;
  }

  broadcast(room);
}

function leaveRoom(session: Session): void {
  if (!session.room) return;
  const room = session.room;
  room.detach(session.connection);
  session.room = null;
  broadcast(room);
}

function send(session: Session, message: ServerMessage): void {
  session.connection.send(message);
}

function broadcast(room: Room): void {
  const snapshot = room.snapshot();
  for (const connection of room.allConnections()) {
    const message: ServerMessage = { type: 'state', seat: room.seatOfConnection(connection), snapshot };
    connection.send(message);
  }
}

function isRateLimited(session: Session): boolean {
  const now = Date.now();
  session.messageTimes = session.messageTimes.filter((time) => now - time < 10_000);
  session.messageTimes.push(now);
  return session.messageTimes.length > 80;
}

function sanitizeToken(token: unknown): string {
  const value = String(token ?? '').slice(0, 64);
  return value || randomUUID();
}

function sanitizeName(name: unknown): string {
  return String(name ?? '')
    .replace(/\p{C}/gu, '')
    .trim()
    .slice(0, 24);
}

async function handleHttp(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);

  if (url.pathname === '/health') {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ ok: true, rooms: store.size, uptime: Math.round(process.uptime()) }));
    return;
  }

  if (!CLIENT_DIR) {
    res.writeHead(503, { 'content-type': 'text/plain; charset=utf-8' });
    res.end('Client non compile : lancer `npm run build`, ou `npm run dev` en developpement.');
    return;
  }

  const relative = normalize(decodeURIComponent(url.pathname));
  let filePath = join(CLIENT_DIR, relative);
  if (!filePath.startsWith(CLIENT_DIR)) {
    res.writeHead(403, { 'content-type': 'text/plain; charset=utf-8' });
    res.end('Forbidden');
    return;
  }

  try {
    const info = await stat(filePath).catch(() => null);
    if (!info || info.isDirectory()) {
      filePath = join(CLIENT_DIR, 'index.html');
    }
    const body = await readFile(filePath);
    const type = MIME[extname(filePath).toLowerCase()] ?? 'application/octet-stream';
    const cache = filePath.endsWith('index.html') ? 'no-cache' : 'public, max-age=31536000, immutable';
    res.writeHead(200, { 'content-type': type, 'cache-control': cache });
    res.end(body);
  } catch {
    res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
    res.end('Not found');
  }
}

httpServer.listen(PORT, HOST, () => {
  console.log(`[go] serveur pret sur http://localhost:${PORT} (websocket sur /ws)`);
  if (!CLIENT_DIR) console.log('[go] client non compile : en developpement, Vite sert le client sur le port 5173');
});

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    console.log(`[go] arret (${signal})`);
    wss.close();
    httpServer.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 2000).unref();
  });
}

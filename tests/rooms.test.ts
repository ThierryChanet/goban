import { describe, expect, it } from 'vitest';
import { RoomStore, generateRoomCode, type Connection } from '../src/server/rooms.js';

let counter = 0;
function fakeConnection(): Connection & { sent: unknown[] } {
  const sent: unknown[] = [];
  return {
    id: `c${counter++}`,
    sent,
    send: (payload: unknown) => sent.push(payload),
    close: () => {},
  };
}

describe('salles de jeu', () => {
  it('genere des codes lisibles sans caracteres ambigus', () => {
    for (let i = 0; i < 200; i++) {
      const code = generateRoomCode();
      expect(code).toMatch(/^[A-HJ-NP-Z2-9]{5}$/);
    }
  });

  it('attribue les places puis bascule en observateur', () => {
    const store = new RoomStore();
    const room = store.create({ size: 9 });
    const host = fakeConnection();
    const guest = fakeConnection();
    const watcher = fakeConnection();

    room.claimSeat('black', 'token-host', 'Alice');
    expect(room.attach(host, 'token-host', 'Alice')).toBe('black');
    expect(room.attach(guest, 'token-guest', 'Bob')).toBe('white');
    expect(room.attach(watcher, 'token-watch', 'Carol')).toBe('observer');

    const snapshot = room.snapshot();
    expect(snapshot.players.black.name).toBe('Alice');
    expect(snapshot.players.white.name).toBe('Bob');
    expect(snapshot.observers).toBe(1);
    expect(snapshot.players.black.open).toBe(false);
  });

  it('rend sa place a un joueur qui se reconnecte', () => {
    const store = new RoomStore();
    const room = store.create({ size: 19 });
    const first = fakeConnection();
    room.claimSeat('white', 'token-a', 'Alice');
    room.attach(first, 'token-a', 'Alice');
    room.detach(first);
    expect(room.snapshot().players.white.connected).toBe(false);

    const second = fakeConnection();
    expect(room.attach(second, 'token-a', 'Alice')).toBe('white');
    expect(room.snapshot().players.white.connected).toBe(true);
  });

  it('retrouve une salle quel que soit la casse du code', () => {
    const store = new RoomStore();
    const room = store.create({ size: 9 });
    expect(store.get(room.id.toLowerCase())?.id).toBe(room.id);
    expect(store.get(` ${room.id} `)?.id).toBe(room.id);
    expect(store.get('ZZZZZ')).toBeUndefined();
  });

  it('echange les couleurs quand les deux joueurs veulent une revanche', () => {
    const store = new RoomStore();
    const room = store.create({ size: 9, handicap: 0 });
    const alice = fakeConnection();
    const bob = fakeConnection();
    room.claimSeat('black', 'token-a', 'Alice');
    room.attach(alice, 'token-a', 'Alice');
    room.attach(bob, 'token-b', 'Bob');

    room.game.play('black', 0);
    room.game.resign('white');
    expect(room.game.phase).toBe('finished');

    room.setRematch('black', true);
    expect(room.game.phase).toBe('finished');
    room.setRematch('white', true);

    expect(room.game.phase).toBe('playing');
    expect(room.game.moveNumber).toBe(0);
    expect(room.seatOf('token-a')).toBe('white');
    expect(room.seatOf('token-b')).toBe('black');
    expect(room.snapshot().players.black.name).toBe('Bob');
    expect(room.snapshot().rematch).toEqual({ black: false, white: false });
  });

  it('conserve les reglages lors de la revanche', () => {
    const store = new RoomStore();
    const room = store.create({ size: 13, handicap: 3, komi: 0.5 });
    room.claimSeat('black', 'a', 'A');
    room.attach(fakeConnection(), 'a', 'A');
    room.attach(fakeConnection(), 'b', 'B');
    room.game.resign('black');
    room.setRematch('black', true);
    room.setRematch('white', true);
    expect(room.game.config.size).toBe(13);
    expect(room.game.config.handicap).toBe(3);
    expect(room.game.handicapStones).toHaveLength(3);
    expect(room.game.toMove).toBe('white');
  });

  it('ne supprime pas une salle encore utilisee', () => {
    const store = new RoomStore();
    const room = store.create({ size: 9 });
    room.attach(fakeConnection(), 'a', 'A');
    expect(store.sweep()).toBe(0);
    expect(store.get(room.id)).toBeDefined();
  });
});

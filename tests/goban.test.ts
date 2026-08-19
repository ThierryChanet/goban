import { describe, expect, it } from 'vitest';
import {
  BLACK,
  EMPTY,
  WHITE,
  createBoard,
  decodeBoard,
  encodeBoard,
  groupAt,
  indexOf,
  neighbors,
  placeStone,
} from '../src/shared/goban.js';

describe('goban', () => {
  it('compte les libertes d une pierre isolee', () => {
    const board = createBoard(9);
    board.cells[indexOf(9, 4, 4)] = BLACK;
    expect(groupAt(board, indexOf(9, 4, 4)).liberties).toHaveLength(4);
  });

  it('compte les libertes reduites dans un coin', () => {
    const board = createBoard(9);
    board.cells[indexOf(9, 0, 0)] = BLACK;
    expect(groupAt(board, indexOf(9, 0, 0)).liberties).toHaveLength(2);
  });

  it('relie les pierres adjacentes en un seul groupe', () => {
    const board = decodeBoard('bb.......');
    const group = groupAt(board, 0);
    expect(group.stones.sort()).toEqual([0, 1]);
    expect(group.liberties.sort((a, b) => a - b)).toEqual([2, 3, 4]);
  });

  it('capture une pierre encerclee', () => {
    // Blanc en (1,1) entoure de noir sur trois cotes, noir ferme la derniere liberte.
    const board = decodeBoard('.b.' + 'bwb' + '...');
    const result = placeStone(board, indexOf(3, 1, 2), 'black');
    expect(result.illegal).toBeNull();
    expect(result.captured).toEqual([indexOf(3, 1, 1)]);
    expect(result.board.cells[indexOf(3, 1, 1)]).toBe(EMPTY);
  });

  it('capture un groupe entier', () => {
    const board = decodeBoard('.b..' + 'bwwb' + '.bb.' + '....');
    const result = placeStone(board, indexOf(4, 2, 0), 'black');
    expect(result.illegal).toBeNull();
    expect(result.captured.sort((a, b) => a - b)).toEqual([indexOf(4, 1, 1), indexOf(4, 2, 1)]);
  });

  it('interdit le suicide', () => {
    const board = decodeBoard('.b.' + 'b.b' + '.b.');
    const result = placeStone(board, indexOf(3, 1, 1), 'white');
    expect(result.illegal).toBe('suicide');
  });

  it('autorise un coup qui capture avant de manquer de libertes', () => {
    // Le coup blanc n a pas de liberte propre mais capture d abord une pierre noire.
    const board = decodeBoard('ww.' + 'wb.' + '.w.');
    const result = placeStone(board, indexOf(3, 2, 1), 'white');
    expect(result.illegal).toBeNull();
    expect(result.captured).toEqual([indexOf(3, 1, 1)]);
  });

  it('refuse une intersection occupee', () => {
    const board = decodeBoard('b........');
    expect(placeStone(board, 0, 'white').illegal).toBe('occupied');
  });

  it('refuse un coup hors du goban', () => {
    const board = createBoard(9);
    expect(placeStone(board, 999, 'black').illegal).toBe('out_of_bounds');
  });

  it('ne modifie pas le plateau d origine', () => {
    const board = createBoard(9);
    const before = encodeBoard(board);
    placeStone(board, 40, 'black');
    expect(encodeBoard(board)).toBe(before);
  });

  it('serialise et deserialise le plateau', () => {
    const board = createBoard(19);
    board.cells[0] = BLACK;
    board.cells[360] = WHITE;
    const round = decodeBoard(encodeBoard(board));
    expect(round.size).toBe(19);
    expect(round.cells[0]).toBe(BLACK);
    expect(round.cells[360]).toBe(WHITE);
  });

  it('limite les voisins aux bords', () => {
    expect(neighbors(9, 0)).toHaveLength(2);
    expect(neighbors(9, 4)).toHaveLength(3);
    expect(neighbors(9, 40)).toHaveLength(4);
  });
});

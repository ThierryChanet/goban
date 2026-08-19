import { describe, expect, it } from 'vitest';
import { computeAreaScore, formatResult } from '../src/shared/scoring.js';
import { decodeBoard, indexOf } from '../src/shared/goban.js';
import { handicapPoints, maxHandicap } from '../src/shared/handicap.js';

describe('comptage chinois', () => {
  it('attribue le territoire entoure par un seul camp', () => {
    // Colonne 0 vide, colonne 1 noire, colonne 2 blanche.
    const board = decodeBoard('.bw' + '.bw' + '.bw');
    const score = computeAreaScore(board, [], 0.5);
    expect(score.blackStones).toBe(3);
    expect(score.whiteStones).toBe(3);
    expect(score.blackTerritory).toBe(3);
    expect(score.whiteTerritory).toBe(0);
    expect(score.blackScore).toBe(6);
    expect(score.whiteScore).toBe(3.5);
    expect(score.result).toBe('B+2.5');
  });

  it('ne donne rien pour les intersections neutres', () => {
    const board = decodeBoard('bb.ww' + 'bb.ww' + 'bb.ww' + 'bb.ww' + 'bb.ww');
    const score = computeAreaScore(board, [], 0);
    expect(score.blackTerritory).toBe(0);
    expect(score.whiteTerritory).toBe(0);
    expect(score.blackScore).toBe(10);
    expect(score.whiteScore).toBe(10);
    expect(score.result).toBe('Draw');
  });

  it('retire les pierres mortes et rend leur emplacement a l adversaire', () => {
    // Une pierre blanche isolee dans le territoire noir.
    const board = decodeBoard('.bw' + 'wbw' + '.bw');
    const withoutRemoval = computeAreaScore(board, [], 0);
    expect(withoutRemoval.blackTerritory).toBe(0); // la pierre blanche coupe le territoire

    const dead = [indexOf(3, 0, 1)];
    const score = computeAreaScore(board, dead, 0);
    expect(score.blackTerritory).toBe(3);
    expect(score.blackScore).toBe(6);
    expect(score.whiteScore).toBe(3);
    expect(score.result).toBe('B+3');
  });

  it('applique le komi a Blanc', () => {
    const board = decodeBoard('bbb' + 'bbb' + 'www');
    const score = computeAreaScore(board, [], 6.5);
    expect(score.blackScore).toBe(6);
    expect(score.whiteScore).toBe(9.5);
    expect(score.result).toBe('W+3.5');
  });

  it('marque la propriete de chaque intersection', () => {
    const board = decodeBoard('.bw' + '.bw' + '.bw');
    const score = computeAreaScore(board, [], 0);
    expect(score.ownership[indexOf(3, 0, 0)]).toBe(1);
    expect(score.ownership[indexOf(3, 1, 0)]).toBe(0);
  });

  it('formate les resultats', () => {
    expect(formatResult(7.5)).toBe('B+7.5');
    expect(formatResult(-2)).toBe('W+2');
    expect(formatResult(0)).toBe('Draw');
  });
});

describe('handicap', () => {
  it('ne place rien en dessous de deux pierres', () => {
    expect(handicapPoints(19, 0)).toEqual([]);
    expect(handicapPoints(19, 1)).toEqual([]);
  });

  it('place les pierres sur les hoshi du 19x19', () => {
    const two = handicapPoints(19, 2);
    expect(two).toEqual([indexOf(19, 15, 3), indexOf(19, 3, 15)]);

    const four = handicapPoints(19, 4);
    expect(new Set(four)).toEqual(
      new Set([indexOf(19, 15, 3), indexOf(19, 3, 15), indexOf(19, 15, 15), indexOf(19, 3, 3)]),
    );

    expect(handicapPoints(19, 5)).toContain(indexOf(19, 9, 9));
    expect(handicapPoints(19, 9)).toHaveLength(9);
    expect(new Set(handicapPoints(19, 9)).size).toBe(9);
  });

  it('utilise les hoshi rapproches sur les petits gobans', () => {
    expect(handicapPoints(9, 2)).toEqual([indexOf(9, 6, 2), indexOf(9, 2, 6)]);
    expect(handicapPoints(13, 4)).toHaveLength(4);
    expect(handicapPoints(9, 9)).toHaveLength(9);
    expect(maxHandicap(9)).toBe(9);
  });
});

import { describe, expect, it } from 'vitest';
import { GoGame, RuleError, normalizeConfig } from '../src/shared/game.js';
import { BLACK, decodeBoard, encodeBoard, indexOf } from '../src/shared/goban.js';

function newGame(size: 9 | 13 | 19 = 9, overrides = {}) {
  return new GoGame(normalizeConfig({ size, handicap: 0, komi: 6.5, firstPlayer: 'black', ...overrides }));
}

const at = (size: number, x: number, y: number) => indexOf(size, x, y);

describe('deroulement de la partie', () => {
  it('alterne les couleurs', () => {
    const game = newGame();
    expect(game.toMove).toBe('black');
    game.play('black', at(9, 3, 3));
    expect(game.toMove).toBe('white');
    game.play('white', at(9, 5, 5));
    expect(game.toMove).toBe('black');
    expect(game.moveNumber).toBe(2);
  });

  it('refuse de jouer hors de son tour', () => {
    const game = newGame();
    expect(() => game.play('white', at(9, 3, 3))).toThrow(RuleError);
  });

  it('laisse Blanc commencer si la configuration le demande', () => {
    const game = newGame(9, { firstPlayer: 'white' });
    expect(game.toMove).toBe('white');
    game.play('white', at(9, 4, 4));
    expect(game.toMove).toBe('black');
  });

  it('compte les prisonniers', () => {
    const game = newGame();
    game.play('black', at(9, 0, 1));
    game.play('white', at(9, 0, 0));
    game.play('black', at(9, 1, 0));
    expect(game.captures.black).toBe(1);
    expect(game.board.cells[at(9, 0, 0)]).toBe(0);
  });

  it('applique la regle de ko', () => {
    const game = newGame();
    const p = (x: number, y: number) => at(9, x, y);
    // Construction d une forme de ko : le point (1,1) pour Noir, (2,1) pour Blanc.
    game.play('black', p(2, 0));
    game.play('white', p(1, 0));
    game.play('black', p(3, 1));
    game.play('white', p(0, 1));
    game.play('black', p(2, 2));
    game.play('white', p(1, 2));
    game.play('black', p(7, 7));
    game.play('white', p(2, 1));

    game.play('black', p(1, 1)); // capture la pierre blanche
    expect(game.captures.black).toBe(1);

    // Reprise immediate interdite.
    let code: string | null = null;
    try {
      game.play('white', p(2, 1));
    } catch (error) {
      code = (error as RuleError).code;
    }
    expect(code).toBe('ko');

    // Apres un coup ailleurs de chaque camp, la reprise devient legale.
    game.play('white', p(7, 0));
    game.play('black', p(0, 7));
    expect(() => game.play('white', p(2, 1))).not.toThrow();
    expect(game.captures.white).toBe(1);
  });

  it('interdit de recreer une position deja vue (super-ko)', () => {
    const game = newGame();
    // Le plateau vide est deja enregistre : une passe ne peut pas etre contournee,
    // et toute repetition exacte est refusee.
    game.play('black', at(9, 4, 4));
    const seen = encodeBoard(game.board);
    game.play('white', at(9, 2, 2));
    expect(encodeBoard(game.board)).not.toBe(seen);
  });

  it('interdit le suicide', () => {
    const game = newGame();
    const p = (x: number, y: number) => at(9, x, y);
    game.play('black', p(0, 1));
    game.play('white', p(8, 8));
    game.play('black', p(1, 0));
    expect(() => game.play('white', p(0, 0))).toThrow(RuleError);
  });

  it('passe la partie en comptage apres deux passes', () => {
    const game = newGame();
    game.pass('black');
    expect(game.phase).toBe('playing');
    game.pass('white');
    expect(game.phase).toBe('marking');
    expect(game.confirmed).toEqual({ black: false, white: false });
  });

  it('remet le compteur de passes a zero apres un coup', () => {
    const game = newGame();
    game.pass('black');
    game.play('white', at(9, 4, 4));
    expect(game.passes).toBe(0);
    game.pass('black');
    expect(game.phase).toBe('playing');
  });

  it('passe au comptage a la demande, sans deux passes', () => {
    const game = newGame();
    game.play('black', at(9, 4, 4));
    game.play('white', at(9, 2, 2));
    game.play('black', at(9, 6, 6));
    expect(game.toMove).toBe('white');

    // N'importe lequel des deux joueurs peut le demander, meme hors de son tour.
    game.requestCount();
    expect(game.phase).toBe('marking');
    expect(game.confirmed).toEqual({ black: false, white: false });
    expect(game.passes).toBe(0);
  });

  it('reprend la partie au meme endroit si le comptage demande est refuse', () => {
    const game = newGame();
    game.play('black', at(9, 4, 4));
    game.play('white', at(9, 2, 2));
    game.play('black', at(9, 6, 6));

    game.requestCount();
    game.resumePlay();
    expect(game.phase).toBe('playing');
    expect(game.toMove).toBe('white'); // le tour de jeu n'a pas bouge
    expect(game.moveNumber).toBe(3);
    expect(game.deadStones.size).toBe(0);
    expect(() => game.play('white', at(9, 2, 6))).not.toThrow();
  });

  it('ne compte pas deux fois ni hors de la phase de jeu', () => {
    const game = newGame();
    game.requestCount();
    expect(() => game.requestCount()).toThrow(RuleError);
    game.confirmScore('black');
    game.confirmScore('white');
    expect(game.phase).toBe('finished');
    expect(() => game.requestCount()).toThrow(RuleError);
  });

  it('termine la partie sur un abandon', () => {
    const game = newGame();
    game.resign('white');
    expect(game.phase).toBe('finished');
    expect(game.result).toBe('B+R');
  });

  it('reprend le jeu si un joueur refuse le comptage', () => {
    const game = newGame();
    game.play('black', at(9, 4, 4));
    game.play('white', at(9, 2, 2));
    game.pass('black');
    game.pass('white');
    expect(game.phase).toBe('marking');
    game.resumePlay();
    expect(game.phase).toBe('playing');
    expect(game.deadStones.size).toBe(0);
    expect(game.toMove).toBe('black');
  });

  it('marque un groupe entier comme mort et annule les validations', () => {
    const game = newGame();
    game.play('black', at(9, 4, 4));
    game.play('white', at(9, 2, 2));
    game.play('black', at(9, 4, 5));
    game.play('white', at(9, 6, 6));
    game.pass('black');
    game.pass('white');

    game.deadStones.clear();
    game.confirmScore('black');
    expect(game.confirmed.black).toBe(true);

    game.toggleDead(at(9, 4, 4));
    expect(game.deadStones.has(at(9, 4, 5))).toBe(true);
    expect(game.confirmed.black).toBe(false);

    game.toggleDead(at(9, 4, 5));
    expect(game.deadStones.size).toBe(0);
  });

  it('cloture la partie quand les deux joueurs valident', () => {
    const game = newGame();
    game.play('black', at(9, 4, 4));
    game.play('white', at(9, 2, 2));
    game.pass('black');
    game.pass('white');
    game.deadStones.clear();
    game.confirmScore('black');
    expect(game.phase).toBe('marking');
    game.confirmScore('white');
    expect(game.phase).toBe('finished');
    expect(game.result).toMatch(/^(B\+|W\+|Draw)/);
    expect(game.score).not.toBeNull();
  });

  it('place les pierres de handicap et fait commencer Blanc', () => {
    const game = new GoGame(normalizeConfig({ size: 19, handicap: 4 }));
    expect(game.handicapStones).toHaveLength(4);
    for (const point of game.handicapStones) {
      expect(game.board.cells[point]).toBe(BLACK);
    }
    expect(game.toMove).toBe('white');
    expect(game.config.komi).toBe(0.5);
    expect(() => game.play('black', at(19, 5, 5))).toThrow(RuleError);
  });

  it('normalise une configuration incoherente', () => {
    const config = normalizeConfig({ size: 42 as never, handicap: 99, komi: Number.NaN });
    expect(config.size).toBe(19);
    expect(config.handicap).toBe(9);
    expect(config.komi).toBe(0.5);
    expect(config.firstPlayer).toBe('white');
  });

  it('produit un instantane serialisable', () => {
    const game = newGame();
    game.play('black', at(9, 4, 4));
    const snapshot = game.snapshot();
    expect(JSON.parse(JSON.stringify(snapshot)).board).toBe(snapshot.board);
    expect(decodeBoard(snapshot.board).cells[at(9, 4, 4)]).toBe(BLACK);
    expect(snapshot.toMove).toBe('white');
  });
});

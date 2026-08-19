import {
  cellOf,
  cloneBoard,
  createBoard,
  decodeBoard,
  encodeBoard,
  groupAt,
  isOnBoard,
  otherColor,
  placeStone,
  type Board,
  type Color,
  EMPTY,
} from './goban.js';
import { handicapPoints } from './handicap.js';
import { computeAreaScore, type ScoreDetail } from './scoring.js';

export type BoardSize = 9 | 13 | 19;
export type Phase = 'playing' | 'marking' | 'finished';

export interface GameConfig {
  size: BoardSize;
  /** 0 (partie a egalite) ou 2 a 9 pierres pour Noir. */
  handicap: number;
  komi: number;
  /** Couleur qui joue le premier coup (impose a Blanc des qu'il y a handicap). */
  firstPlayer: Color;
}

export type RuleErrorCode =
  | 'not_your_turn'
  | 'occupied'
  | 'suicide'
  | 'ko'
  | 'out_of_bounds'
  | 'wrong_phase'
  | 'not_a_stone'
  | 'nothing_to_undo';

export class RuleError extends Error {
  constructor(public readonly code: RuleErrorCode) {
    super(code);
    this.name = 'RuleError';
  }
}

/** Etat d'avant un coup, conserve pour pouvoir revenir en arriere. */
interface UndoEntry {
  board: string;
  toMove: Color;
  captures: { black: number; white: number };
  lastMove: number | null;
  passes: number;
  /** Position ajoutee a l'historique de super-ko par ce coup (null pour une passe). */
  addedPosition: string | null;
}

export interface MoveRecord {
  color: Color;
  /** Index de l'intersection, ou null pour une passe. */
  point: number | null;
  captured: number;
}

export interface GameSnapshot {
  config: GameConfig;
  phase: Phase;
  board: string;
  toMove: Color;
  captures: { black: number; white: number };
  lastMove: number | null;
  moveNumber: number;
  passes: number;
  handicapStones: number[];
  deadStones: number[];
  canUndo: boolean;
  confirmed: { black: boolean; white: boolean };
  history: MoveRecord[];
  result: string | null;
  score: SerializedScore | null;
}

export interface SerializedScore {
  blackStones: number;
  whiteStones: number;
  blackTerritory: number;
  whiteTerritory: number;
  komi: number;
  blackScore: number;
  whiteScore: number;
  result: string;
  ownership: string;
  finalBoard: string;
}

export const DEFAULT_KOMI = 6.5;
export const HANDICAP_KOMI = 0.5;

export function normalizeConfig(raw: Partial<GameConfig> | undefined): GameConfig {
  const size = ([9, 13, 19] as const).includes(raw?.size as BoardSize) ? (raw!.size as BoardSize) : 19;
  let handicap = Math.round(Number(raw?.handicap ?? 0));
  if (!Number.isFinite(handicap) || handicap < 2) handicap = 0;
  handicap = Math.min(handicap, 9);

  const komiRaw = Number(raw?.komi);
  const komi = Number.isFinite(komiRaw)
    ? Math.max(-100, Math.min(100, Math.round(komiRaw * 2) / 2))
    : handicap > 0
      ? HANDICAP_KOMI
      : DEFAULT_KOMI;

  // Avec handicap, Noir a deja pose ses pierres : Blanc joue le premier coup.
  const firstPlayer: Color = handicap > 0 ? 'white' : raw?.firstPlayer === 'white' ? 'white' : 'black';

  return { size, handicap, komi, firstPlayer };
}

/**
 * Etat complet d'une partie et transitions autorisees.
 * Regle de ko : super-ko positionnel (aucune position deja apparue ne peut
 * etre recreee), ce qui couvre le ko simple et les triples ko.
 */
export class GoGame {
  readonly config: GameConfig;
  board: Board;
  toMove: Color;
  captures: { black: number; white: number } = { black: 0, white: 0 };
  lastMove: number | null = null;
  moveNumber = 0;
  passes = 0;
  phase: Phase = 'playing';
  history: MoveRecord[] = [];
  handicapStones: number[] = [];
  deadStones = new Set<number>();
  confirmed: { black: boolean; white: boolean } = { black: false, white: false };
  result: string | null = null;
  score: ScoreDetail | null = null;

  private positions = new Set<string>();
  private undoStack: UndoEntry[] = [];

  constructor(config: GameConfig) {
    this.config = config;
    this.board = createBoard(config.size);
    if (config.handicap >= 2) {
      this.handicapStones = handicapPoints(config.size, config.handicap);
      for (const point of this.handicapStones) {
        this.board.cells[point] = cellOf('black');
      }
    }
    this.toMove = config.firstPlayer;
    this.positions.add(encodeBoard(this.board));
  }

  /** Le coup est-il jouable ? Utile pour l'apercu cote client. */
  isLegal(color: Color, point: number): boolean {
    try {
      this.checkMove(color, point);
      return true;
    } catch {
      return false;
    }
  }

  play(color: Color, point: number): void {
    const { board, captured } = this.checkMove(color, point);
    this.pushUndo(encodeBoard(board));
    this.board = board;
    this.captures[color] += captured.length;
    this.lastMove = point;
    this.moveNumber++;
    this.passes = 0;
    this.history.push({ color, point, captured: captured.length });
    this.positions.add(encodeBoard(board));
    this.toMove = otherColor(color);
  }

  private checkMove(color: Color, point: number): { board: Board; captured: number[] } {
    if (this.phase !== 'playing') throw new RuleError('wrong_phase');
    if (color !== this.toMove) throw new RuleError('not_your_turn');
    if (!isOnBoard(this.board.size, point)) throw new RuleError('out_of_bounds');

    const placement = placeStone(this.board, point, color);
    if (placement.illegal === 'occupied') throw new RuleError('occupied');
    if (placement.illegal === 'suicide') throw new RuleError('suicide');
    if (placement.illegal === 'out_of_bounds') throw new RuleError('out_of_bounds');

    if (this.positions.has(encodeBoard(placement.board))) throw new RuleError('ko');
    return { board: placement.board, captured: placement.captured };
  }

  pass(color: Color): void {
    if (this.phase !== 'playing') throw new RuleError('wrong_phase');
    if (color !== this.toMove) throw new RuleError('not_your_turn');

    this.pushUndo(null);
    this.passes++;
    this.moveNumber++;
    this.lastMove = null;
    this.history.push({ color, point: null, captured: 0 });
    this.toMove = otherColor(color);

    if (this.passes >= 2) {
      this.enterMarking();
    }
  }

  /**
   * Arrete la partie en l'etat et passe directement au comptage, sans attendre
   * deux passes. N'importe lequel des deux joueurs peut le demander, a tout
   * moment : ce n'est pas un abandon, l'adversaire peut refuser le comptage et
   * la partie repart exactement ou elle en etait (`resumePlay`).
   */
  requestCount(): void {
    if (this.phase !== 'playing') throw new RuleError('wrong_phase');
    this.enterMarking();
  }

  private enterMarking(): void {
    this.phase = 'marking';
    this.confirmed = { black: false, white: false };
    this.deadStones = new Set(this.guessDeadStones());
  }

  /** Y a-t-il un coup a annuler ? */
  get canUndo(): boolean {
    return this.phase === 'playing' && this.undoStack.length > 0;
  }

  /**
   * Annule le dernier coup ou la derniere passe, quel qu'en soit l'auteur :
   * plateau, prisonniers, tour de jeu et historique de super-ko reviennent
   * exactement dans l'etat d'avant. Les pierres de handicap ne sont jamais
   * concernees, elles ne font pas partie des coups joues.
   */
  undo(): void {
    if (this.phase !== 'playing') throw new RuleError('wrong_phase');
    const entry = this.undoStack.pop();
    if (!entry) throw new RuleError('nothing_to_undo');

    this.board = decodeBoard(entry.board);
    this.toMove = entry.toMove;
    this.captures = { ...entry.captures };
    this.lastMove = entry.lastMove;
    this.passes = entry.passes;
    if (entry.addedPosition !== null) this.positions.delete(entry.addedPosition);
    this.moveNumber = Math.max(0, this.moveNumber - 1);
    this.history.pop();
  }

  private pushUndo(addedPosition: string | null): void {
    this.undoStack.push({
      board: encodeBoard(this.board),
      toMove: this.toMove,
      captures: { ...this.captures },
      lastMove: this.lastMove,
      passes: this.passes,
      addedPosition,
    });
  }

  resign(color: Color): void {
    if (this.phase === 'finished') throw new RuleError('wrong_phase');
    this.phase = 'finished';
    this.score = null;
    this.result = color === 'black' ? 'W+R' : 'B+R';
  }

  /** Marque ou demarque tout le groupe touche pendant la phase de comptage. */
  toggleDead(point: number): void {
    if (this.phase !== 'marking') throw new RuleError('wrong_phase');
    if (!isOnBoard(this.board.size, point)) throw new RuleError('out_of_bounds');
    if (this.board.cells[point] === EMPTY) throw new RuleError('not_a_stone');

    const group = groupAt(this.board, point);
    const markDead = !this.deadStones.has(point);
    for (const stone of group.stones) {
      if (markDead) this.deadStones.add(stone);
      else this.deadStones.delete(stone);
    }
    this.confirmed = { black: false, white: false };
  }

  confirmScore(color: Color): void {
    if (this.phase !== 'marking') throw new RuleError('wrong_phase');
    this.confirmed[color] = true;
    if (this.confirmed.black && this.confirmed.white) {
      this.finish();
    }
  }

  /** Un joueur refuse le comptage : la partie reprend la ou elle en etait. */
  resumePlay(): void {
    if (this.phase !== 'marking') throw new RuleError('wrong_phase');
    this.phase = 'playing';
    this.passes = 0;
    this.deadStones.clear();
    this.confirmed = { black: false, white: false };
  }

  private finish(): void {
    this.score = computeAreaScore(this.board, this.deadStones, this.config.komi);
    this.result = this.score.result;
    this.phase = 'finished';
  }

  /**
   * Proposition de depart pour le marquage : les groupes n'ayant qu'une seule
   * liberte a l'arret du jeu sont presque toujours morts. Les joueurs ajustent.
   */
  private guessDeadStones(): number[] {
    const dead: number[] = [];
    const seen = new Uint8Array(this.board.cells.length);
    for (let i = 0; i < this.board.cells.length; i++) {
      if (this.board.cells[i] === EMPTY || seen[i]) continue;
      const group = groupAt(this.board, i);
      for (const stone of group.stones) seen[stone] = 1;
      if (group.liberties.length <= 1) dead.push(...group.stones);
    }
    return dead;
  }

  snapshot(): GameSnapshot {
    return {
      config: this.config,
      phase: this.phase,
      board: encodeBoard(this.board),
      toMove: this.toMove,
      captures: { ...this.captures },
      lastMove: this.lastMove,
      moveNumber: this.moveNumber,
      passes: this.passes,
      handicapStones: [...this.handicapStones],
      deadStones: [...this.deadStones],
      canUndo: this.canUndo,
      confirmed: { ...this.confirmed },
      history: this.history.slice(-200),
      result: this.result,
      score: this.score ? serializeScore(this.score) : null,
    };
  }

  /** Copie defensive du plateau (les tests et le client ne mutent pas l'etat). */
  boardCopy(): Board {
    return cloneBoard(this.board);
  }
}

function serializeScore(score: ScoreDetail): SerializedScore {
  let ownership = '';
  for (const value of score.ownership) {
    ownership += value === 1 ? 'b' : value === 2 ? 'w' : '.';
  }
  let finalBoard = '';
  for (const cell of score.finalCells) {
    finalBoard += cell === 1 ? 'b' : cell === 2 ? 'w' : '.';
  }
  return {
    blackStones: score.blackStones,
    whiteStones: score.whiteStones,
    blackTerritory: score.blackTerritory,
    whiteTerritory: score.whiteTerritory,
    komi: score.komi,
    blackScore: score.blackScore,
    whiteScore: score.whiteScore,
    result: score.result,
    ownership,
    finalBoard,
  };
}

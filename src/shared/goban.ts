/**
 * Goban : representation du plateau et mecanique de base (groupes, libertes,
 * captures, suicide). Aucune notion de tour de jeu ici, c'est le role de game.ts.
 */

export const EMPTY = 0;
export const BLACK = 1;
export const WHITE = 2;

export type Cell = typeof EMPTY | typeof BLACK | typeof WHITE;
export type Color = 'black' | 'white';

export interface Board {
  readonly size: number;
  readonly cells: Uint8Array;
}

export function otherColor(color: Color): Color {
  return color === 'black' ? 'white' : 'black';
}

export function cellOf(color: Color): Cell {
  return color === 'black' ? BLACK : WHITE;
}

export function colorOf(cell: Cell): Color | null {
  if (cell === BLACK) return 'black';
  if (cell === WHITE) return 'white';
  return null;
}

export function createBoard(size: number): Board {
  return { size, cells: new Uint8Array(size * size) };
}

export function cloneBoard(board: Board): Board {
  return { size: board.size, cells: Uint8Array.from(board.cells) };
}

export function indexOf(size: number, x: number, y: number): number {
  return y * size + x;
}

export function coordsOf(size: number, index: number): { x: number; y: number } {
  return { x: index % size, y: Math.floor(index / size) };
}

export function isOnBoard(size: number, index: number): boolean {
  return Number.isInteger(index) && index >= 0 && index < size * size;
}

/** Indices des intersections adjacentes (haut, bas, gauche, droite). */
export function neighbors(size: number, index: number): number[] {
  const x = index % size;
  const y = (index - x) / size;
  const out: number[] = [];
  if (y > 0) out.push(index - size);
  if (y < size - 1) out.push(index + size);
  if (x > 0) out.push(index - 1);
  if (x < size - 1) out.push(index + 1);
  return out;
}

export interface Group {
  /** Indices des pierres du groupe. */
  stones: number[];
  /** Indices des intersections vides adjacentes. */
  liberties: number[];
}

/** Groupe connexe (meme couleur) contenant `index`, avec ses libertes. */
export function groupAt(board: Board, index: number): Group {
  const color = board.cells[index] as Cell;
  const stones: number[] = [];
  const liberties: number[] = [];
  if (color === EMPTY) return { stones, liberties };

  const seen = new Uint8Array(board.cells.length);
  const libSeen = new Uint8Array(board.cells.length);
  const stack = [index];
  seen[index] = 1;

  while (stack.length > 0) {
    const current = stack.pop()!;
    stones.push(current);
    for (const n of neighbors(board.size, current)) {
      const cell = board.cells[n];
      if (cell === EMPTY) {
        if (!libSeen[n]) {
          libSeen[n] = 1;
          liberties.push(n);
        }
      } else if (cell === color && !seen[n]) {
        seen[n] = 1;
        stack.push(n);
      }
    }
  }
  return { stones, liberties };
}

export function countLiberties(board: Board, index: number): number {
  return groupAt(board, index).liberties.length;
}

export interface PlacementResult {
  board: Board;
  /** Indices des pierres adverses capturees par ce coup. */
  captured: number[];
  /** Motif d'illegalite, ou null si le coup est legal. */
  illegal: null | 'occupied' | 'suicide' | 'out_of_bounds';
}

/**
 * Pose une pierre et applique les captures. Ne verifie ni le tour de jeu
 * ni la regle de ko (voir game.ts).
 */
export function placeStone(board: Board, index: number, color: Color): PlacementResult {
  if (!isOnBoard(board.size, index)) {
    return { board, captured: [], illegal: 'out_of_bounds' };
  }
  if (board.cells[index] !== EMPTY) {
    return { board, captured: [], illegal: 'occupied' };
  }

  const next = cloneBoard(board);
  const me = cellOf(color);
  const enemy = cellOf(otherColor(color));
  next.cells[index] = me;

  const captured: number[] = [];
  for (const n of neighbors(next.size, index)) {
    if (next.cells[n] !== enemy) continue;
    const group = groupAt(next, n);
    if (group.liberties.length === 0) {
      for (const stone of group.stones) {
        next.cells[stone] = EMPTY;
        captured.push(stone);
      }
    }
  }

  if (captured.length === 0 && groupAt(next, index).liberties.length === 0) {
    return { board, captured: [], illegal: 'suicide' };
  }

  return { board: next, captured, illegal: null };
}

/** Serialisation compacte : un caractere par intersection ('.', 'b', 'w'). */
export function encodeBoard(board: Board): string {
  let out = '';
  for (let i = 0; i < board.cells.length; i++) {
    out += board.cells[i] === BLACK ? 'b' : board.cells[i] === WHITE ? 'w' : '.';
  }
  return out;
}

export function decodeBoard(encoded: string): Board {
  const size = Math.round(Math.sqrt(encoded.length));
  const board = createBoard(size);
  for (let i = 0; i < encoded.length; i++) {
    board.cells[i] = encoded[i] === 'b' ? BLACK : encoded[i] === 'w' ? WHITE : EMPTY;
  }
  return board;
}

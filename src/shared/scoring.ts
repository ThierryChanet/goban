import { BLACK, EMPTY, WHITE, neighbors, type Board } from './goban.js';

export type Owner = 0 | 1 | 2; // 0 = neutre (dame), 1 = noir, 2 = blanc

export interface ScoreDetail {
  blackStones: number;
  whiteStones: number;
  blackTerritory: number;
  whiteTerritory: number;
  komi: number;
  blackScore: number;
  whiteScore: number;
  /** Ecart positif = avantage noir. */
  difference: number;
  /** "B+7.5", "W+2.5" ou "Draw". */
  result: string;
  /** Proprietaire de chaque intersection vide apres retrait des pierres mortes. */
  ownership: Uint8Array;
  /** Plateau apres retrait des pierres mortes, pour l'affichage final. */
  finalCells: Uint8Array;
}

/**
 * Comptage a la chinoise (comptage de surface) : chaque camp marque ses pierres
 * vivantes sur le plateau plus les intersections vides qu'il entoure seul.
 * Les pierres marquees mortes sont retirees avant le comptage.
 */
export function computeAreaScore(board: Board, deadStones: Iterable<number>, komi: number): ScoreDetail {
  const cells = Uint8Array.from(board.cells);
  for (const index of deadStones) {
    cells[index] = EMPTY;
  }

  const size = board.size;
  const ownership = new Uint8Array(cells.length);
  const visited = new Uint8Array(cells.length);

  let blackStones = 0;
  let whiteStones = 0;
  for (const cell of cells) {
    if (cell === BLACK) blackStones++;
    else if (cell === WHITE) whiteStones++;
  }

  let blackTerritory = 0;
  let whiteTerritory = 0;

  for (let start = 0; start < cells.length; start++) {
    if (cells[start] !== EMPTY || visited[start]) continue;

    const region: number[] = [];
    const stack = [start];
    visited[start] = 1;
    let touchesBlack = false;
    let touchesWhite = false;

    while (stack.length > 0) {
      const current = stack.pop()!;
      region.push(current);
      for (const n of neighbors(size, current)) {
        const cell = cells[n];
        if (cell === EMPTY) {
          if (!visited[n]) {
            visited[n] = 1;
            stack.push(n);
          }
        } else if (cell === BLACK) {
          touchesBlack = true;
        } else {
          touchesWhite = true;
        }
      }
    }

    const owner: Owner = touchesBlack && !touchesWhite ? 1 : touchesWhite && !touchesBlack ? 2 : 0;
    if (owner !== 0) {
      for (const index of region) ownership[index] = owner;
      if (owner === 1) blackTerritory += region.length;
      else whiteTerritory += region.length;
    }
  }

  const blackScore = blackStones + blackTerritory;
  const whiteScore = whiteStones + whiteTerritory + komi;
  const difference = blackScore - whiteScore;

  return {
    blackStones,
    whiteStones,
    blackTerritory,
    whiteTerritory,
    komi,
    blackScore,
    whiteScore,
    difference,
    result: formatResult(difference),
    ownership,
    finalCells: cells,
  };
}

export function formatResult(difference: number): string {
  if (difference > 0) return `B+${trimNumber(difference)}`;
  if (difference < 0) return `W+${trimNumber(-difference)}`;
  return 'Draw';
}

function trimNumber(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

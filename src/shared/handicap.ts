import { indexOf } from './goban.js';

/**
 * Points de handicap standards (hoshi), dans l'ordre de placement usuel :
 * coin superieur droit, coin inferieur gauche, coin inferieur droit,
 * coin superieur gauche, puis les cotes, puis le centre (tengen).
 */
export function handicapPoints(size: number, count: number): number[] {
  if (count < 2) return [];

  const edge = size >= 13 ? 3 : 2;
  const far = size - 1 - edge;
  const center = (size - 1) / 2;
  const hasCenter = Number.isInteger(center);

  const p = (x: number, y: number) => indexOf(size, x, y);
  const topRight = p(far, edge);
  const bottomLeft = p(edge, far);
  const bottomRight = p(far, far);
  const topLeft = p(edge, edge);
  const left = hasCenter ? p(edge, center) : -1;
  const right = hasCenter ? p(far, center) : -1;
  const top = hasCenter ? p(center, edge) : -1;
  const bottom = hasCenter ? p(center, far) : -1;
  const tengen = hasCenter ? p(center, center) : -1;

  const n = Math.min(count, hasCenter ? 9 : 4);
  const base = [topRight, bottomLeft, bottomRight, topLeft];

  switch (n) {
    case 2:
      return [topRight, bottomLeft];
    case 3:
      return [topRight, bottomLeft, bottomRight];
    case 4:
      return base;
    case 5:
      return [...base, tengen];
    case 6:
      return [...base, left, right];
    case 7:
      return [...base, left, right, tengen];
    case 8:
      return [...base, left, right, top, bottom];
    case 9:
      return [...base, left, right, top, bottom, tengen];
    default:
      return base.slice(0, n);
  }
}

/** Nombre maximum de pierres de handicap propose pour une taille donnee. */
export function maxHandicap(size: number): number {
  return (size - 1) / 2 === Math.floor((size - 1) / 2) ? 9 : 4;
}

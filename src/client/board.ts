import { BLACK, EMPTY, WHITE, coordsOf, indexOf, type Color } from '../shared/goban.js';

export interface BoardView {
  size: number;
  cells: Uint8Array;
  lastMove: number | null;
  deadStones: Set<number>;
  /** Chaine 'b'/'w'/'.' du proprietaire de chaque intersection, en fin de partie. */
  ownership: string | null;
  /** Intersection visee avant confirmation (mobile). */
  aim: number | null;
  /** Apercu du coup sous le curseur (souris). */
  hover: number | null;
  playerColor: Color | null;
  showCoordinates: boolean;
  interactive: boolean;
}

const COLUMN_LABELS = 'ABCDEFGHJKLMNOPQRSTUVWXYZ';

const STAR_POINTS: Record<number, number[][]> = {
  9: [
    [2, 2],
    [6, 2],
    [4, 4],
    [2, 6],
    [6, 6],
  ],
  13: [
    [3, 3],
    [9, 3],
    [6, 6],
    [3, 9],
    [9, 9],
  ],
  19: [
    [3, 3],
    [9, 3],
    [15, 3],
    [3, 9],
    [9, 9],
    [15, 9],
    [3, 15],
    [9, 15],
    [15, 15],
  ],
};

/** Dessin du goban sur un canvas, adapte a la densite d'ecran. */
export class BoardRenderer {
  private ctx: CanvasRenderingContext2D;
  private cssSize = 0;
  private offsetX = 0;
  private offsetY = 0;
  private step = 0;
  private origin = 0;
  private view: BoardView | null = null;

  constructor(private readonly canvas: HTMLCanvasElement) {
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas 2D non disponible');
    this.ctx = ctx;
  }

  /**
   * Adapte le canvas a la place disponible. Le goban reste carre et centre,
   * quelle que soit la forme du conteneur (telephone en portrait, ecran large...).
   */
  resize(): void {
    const rect = this.canvas.getBoundingClientRect();
    const width = Math.max(1, Math.floor(rect.width));
    const height = Math.max(1, Math.floor(rect.height));
    const cssSize = Math.min(width, height);
    const ratio = Math.min(window.devicePixelRatio || 1, 3);

    this.cssSize = cssSize;
    this.offsetX = Math.floor((width - cssSize) / 2);
    this.offsetY = Math.floor((height - cssSize) / 2);
    this.canvas.width = Math.floor(width * ratio);
    this.canvas.height = Math.floor(height * ratio);
    this.ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    if (this.view) this.draw(this.view);
  }

  draw(view: BoardView): void {
    this.view = view;
    const { ctx, cssSize } = this;
    if (cssSize <= 0) return;

    const n = view.size;
    this.step = cssSize / (n + 1);
    this.origin = this.step;
    const step = this.step;
    const stoneRadius = step * 0.47;

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    const ratio = Math.min(window.devicePixelRatio || 1, 3);
    ctx.setTransform(ratio, 0, 0, ratio, this.offsetX * ratio, this.offsetY * ratio);
    this.drawWood(cssSize);
    this.drawGrid(n, step);
    this.drawStars(n, step);
    if (view.showCoordinates) this.drawCoordinates(n, step);
    this.drawOwnership(view, step);
    this.drawStones(view, stoneRadius);
    this.drawLastMove(view, stoneRadius);
    this.drawAim(view, stoneRadius);
  }

  private drawWood(size: number): void {
    const { ctx } = this;
    const gradient = ctx.createLinearGradient(0, 0, size, size);
    gradient.addColorStop(0, '#e8bd7a');
    gradient.addColorStop(0.5, '#dcae6a');
    gradient.addColorStop(1, '#cf9d58');
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.roundRect(0, 0, size, size, Math.max(4, size * 0.02));
    ctx.fill();
  }

  private point(index: number): { px: number; py: number } {
    const { x, y } = coordsOf(this.view!.size, index);
    return { px: this.origin + x * this.step, py: this.origin + y * this.step };
  }

  private drawGrid(n: number, step: number): void {
    const { ctx, origin } = this;
    const end = origin + (n - 1) * step;
    ctx.strokeStyle = 'rgba(40, 26, 12, 0.85)';
    ctx.lineWidth = Math.max(1, step * 0.03);
    ctx.beginPath();
    for (let i = 0; i < n; i++) {
      const position = origin + i * step;
      ctx.moveTo(origin, position);
      ctx.lineTo(end, position);
      ctx.moveTo(position, origin);
      ctx.lineTo(position, end);
    }
    ctx.stroke();
  }

  private drawStars(n: number, step: number): void {
    const stars = STAR_POINTS[n];
    if (!stars) return;
    const { ctx, origin } = this;
    ctx.fillStyle = 'rgba(40, 26, 12, 0.9)';
    const radius = Math.max(1.5, step * 0.08);
    for (const [x, y] of stars) {
      ctx.beginPath();
      ctx.arc(origin + x * step, origin + y * step, radius, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  private drawCoordinates(n: number, step: number): void {
    const { ctx, origin, cssSize } = this;
    const fontSize = Math.max(8, step * 0.4);
    ctx.fillStyle = 'rgba(60, 40, 18, 0.85)';
    ctx.font = `${fontSize}px system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (let i = 0; i < n; i++) {
      const position = origin + i * step;
      ctx.fillText(COLUMN_LABELS[i], position, step * 0.36);
      ctx.fillText(COLUMN_LABELS[i], position, cssSize - step * 0.36);
      const label = String(n - i);
      ctx.fillText(label, step * 0.36, position);
      ctx.fillText(label, cssSize - step * 0.36, position);
    }
  }

  private drawStones(view: BoardView, radius: number): void {
    for (let i = 0; i < view.cells.length; i++) {
      const cell = view.cells[i];
      if (cell === EMPTY) continue;
      const { px, py } = this.point(i);
      const dead = view.deadStones.has(i);
      this.drawStone(px, py, radius, cell === BLACK ? 'black' : 'white', dead ? 0.3 : 1);
      if (dead) this.drawCross(px, py, radius * 0.55, cell === BLACK ? '#f5f5f5' : '#1a1a1a');
    }
  }

  private drawStone(px: number, py: number, radius: number, color: Color, alpha: number): void {
    const { ctx } = this;
    ctx.save();
    ctx.globalAlpha = alpha;

    ctx.beginPath();
    ctx.arc(px, py + radius * 0.08, radius, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(0, 0, 0, 0.28)';
    ctx.fill();

    const gradient = ctx.createRadialGradient(
      px - radius * 0.35,
      py - radius * 0.4,
      radius * 0.1,
      px,
      py,
      radius,
    );
    if (color === 'black') {
      gradient.addColorStop(0, '#6b6b6b');
      gradient.addColorStop(0.45, '#262626');
      gradient.addColorStop(1, '#0a0a0a');
    } else {
      gradient.addColorStop(0, '#ffffff');
      gradient.addColorStop(0.6, '#f1efe9');
      gradient.addColorStop(1, '#cdc8bd');
    }
    ctx.beginPath();
    ctx.arc(px, py, radius, 0, Math.PI * 2);
    ctx.fillStyle = gradient;
    ctx.fill();
    ctx.restore();
  }

  private drawCross(px: number, py: number, size: number, color: string): void {
    const { ctx } = this;
    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = Math.max(1.5, size * 0.3);
    ctx.beginPath();
    ctx.moveTo(px - size, py - size);
    ctx.lineTo(px + size, py + size);
    ctx.moveTo(px + size, py - size);
    ctx.lineTo(px - size, py + size);
    ctx.stroke();
    ctx.restore();
  }

  private drawLastMove(view: BoardView, radius: number): void {
    if (view.lastMove === null || view.cells[view.lastMove] === EMPTY) return;
    const { ctx } = this;
    const { px, py } = this.point(view.lastMove);
    ctx.save();
    ctx.strokeStyle = view.cells[view.lastMove] === BLACK ? '#f2f2f2' : '#1c1c1c';
    ctx.lineWidth = Math.max(1.5, radius * 0.14);
    ctx.beginPath();
    ctx.arc(px, py, radius * 0.45, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  private drawOwnership(view: BoardView, step: number): void {
    if (!view.ownership) return;
    const { ctx } = this;
    const side = step * 0.34;
    for (let i = 0; i < view.ownership.length; i++) {
      const owner = view.ownership[i];
      if (owner !== 'b' && owner !== 'w') continue;
      if (view.cells[i] !== EMPTY && !view.deadStones.has(i)) continue;
      const { px, py } = this.point(i);
      ctx.fillStyle = owner === 'b' ? 'rgba(20, 20, 20, 0.72)' : 'rgba(252, 252, 250, 0.82)';
      ctx.fillRect(px - side / 2, py - side / 2, side, side);
    }
  }

  private drawAim(view: BoardView, radius: number): void {
    const target = view.aim ?? view.hover;
    if (target === null || target === undefined) return;
    if (!view.interactive || !view.playerColor) return;
    if (view.cells[target] !== EMPTY) return;

    const { px, py } = this.point(target);
    this.drawStone(px, py, radius, view.playerColor, view.aim === target ? 0.85 : 0.45);

    if (view.aim === target) {
      const { ctx } = this;
      ctx.save();
      ctx.strokeStyle = view.playerColor === 'black' ? '#ffd166' : '#c1121f';
      ctx.lineWidth = Math.max(2, radius * 0.18);
      ctx.beginPath();
      ctx.arc(px, py, radius * 1.15, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }
  }

  /** Intersection la plus proche du point ecran, ou null si trop loin du goban. */
  pointAt(clientX: number, clientY: number): number | null {
    if (!this.view || this.step <= 0) return null;
    const rect = this.canvas.getBoundingClientRect();
    const x = clientX - rect.left - this.offsetX;
    const y = clientY - rect.top - this.offsetY;
    const n = this.view.size;

    const gx = Math.round((x - this.origin) / this.step);
    const gy = Math.round((y - this.origin) / this.step);
    if (gx < 0 || gy < 0 || gx >= n || gy >= n) return null;

    const dx = x - (this.origin + gx * this.step);
    const dy = y - (this.origin + gy * this.step);
    if (Math.hypot(dx, dy) > this.step * 0.8) return null;

    return indexOf(n, gx, gy);
  }
}

export function decodeCells(encoded: string): Uint8Array {
  const cells = new Uint8Array(encoded.length);
  for (let i = 0; i < encoded.length; i++) {
    cells[i] = encoded[i] === 'b' ? BLACK : encoded[i] === 'w' ? WHITE : EMPTY;
  }
  return cells;
}

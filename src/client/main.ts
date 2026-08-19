import './styles.css';
import { BoardRenderer, decodeCells, type BoardView } from './board.js';
import { GoClient, type NetStatus } from './net.js';
import { errorMessage, getLang, setLang, t, type Lang } from './i18n.js';
import type { RoomSnapshot, Seat } from '../shared/protocol.js';
import type { BoardSize, GameConfig } from '../shared/game.js';
import { DEFAULT_KOMI, HANDICAP_KOMI } from '../shared/game.js';
import { EMPTY, decodeBoard, placeStone, type Color } from '../shared/goban.js';

/* ------------------------------------------------------------------ */
/* Etat local                                                          */
/* ------------------------------------------------------------------ */

const el = <T extends HTMLElement>(id: string): T => {
  const node = document.getElementById(id);
  if (!node) throw new Error(`Element introuvable : ${id}`);
  return node as T;
};

const TOKEN_KEY = 'go:token';
const NAME_KEY = 'go:name';

function ensureToken(): string {
  let token = localStorage.getItem(TOKEN_KEY);
  if (!token) {
    token = crypto.randomUUID();
    localStorage.setItem(TOKEN_KEY, token);
  }
  return token;
}

interface FormState {
  size: BoardSize;
  handicap: number;
  komi: number;
  color: Color | 'random';
  firstPlayer: Color;
}

const form: FormState = { size: 19, handicap: 0, komi: DEFAULT_KOMI, color: 'black', firstPlayer: 'black' };

let snapshot: RoomSnapshot | null = null;
let seat: Seat | null = null;
let aim: number | null = null;
let hover: number | null = null;
let status: NetStatus = 'connecting';
let previousMoveNumber = -1;
let toastTimer: number | undefined;

const canvas = el<HTMLCanvasElement>('board');
const renderer = new BoardRenderer(canvas);

const client = new GoClient(ensureToken(), localStorage.getItem(NAME_KEY) ?? '', {
  onStatus: (next) => {
    status = next;
    renderStatus();
  },
  onJoined: (roomId, assignedSeat, next) => {
    seat = assignedSeat;
    snapshot = next;
    previousMoveNumber = next.game.moveNumber;
    aim = null;
    const url = new URL(location.href);
    url.searchParams.set('g', roomId);
    history.replaceState(null, '', url);
    showScreen('game');
    render();
  },
  onState: (nextSeat, next) => {
    // La place peut changer en cours de route : couleurs echangees a la revanche.
    if (nextSeat !== seat) aim = null;
    seat = nextSeat;
    snapshot = next;
    render();
  },
  onError: (code) => {
    aim = null;
    showToast(errorMessage(code));
    render();
  },
});

/* ------------------------------------------------------------------ */
/* Traductions                                                         */
/* ------------------------------------------------------------------ */

function applyTranslations(): void {
  document.documentElement.lang = getLang();
  for (const node of document.querySelectorAll<HTMLElement>('[data-i18n]')) {
    const key = node.dataset.i18n as Parameters<typeof t>[0];
    const value = t(key);
    if (typeof value === 'string') node.textContent = value;
  }
  el<HTMLInputElement>('input-name').placeholder = t('namePlaceholder');
  el<HTMLInputElement>('input-code').placeholder = t('roomCodePlaceholder');
  buildHandicapOptions();
  render();
}

function buildHandicapOptions(): void {
  const select = el<HTMLSelectElement>('select-handicap');
  select.innerHTML = '';
  const none = document.createElement('option');
  none.value = '0';
  none.textContent = t('handicapNone');
  select.append(none);
  for (let n = 2; n <= 9; n++) {
    const option = document.createElement('option');
    option.value = String(n);
    option.textContent = t('handicapStones')(n);
    select.append(option);
  }
  select.value = String(form.handicap);
}

/* ------------------------------------------------------------------ */
/* Ecrans                                                              */
/* ------------------------------------------------------------------ */

function showScreen(name: 'home' | 'game'): void {
  el('screen-home').classList.toggle('hidden', name !== 'home');
  el('screen-game').classList.toggle('hidden', name === 'home');
  if (name === 'game') requestAnimationFrame(() => renderer.resize());
}

function showToast(message: string): void {
  const toast = el('toast');
  toast.textContent = message;
  toast.classList.remove('hidden');
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => toast.classList.add('hidden'), 3000);
}

/* ------------------------------------------------------------------ */
/* Rendu                                                               */
/* ------------------------------------------------------------------ */

function myColor(): Color | null {
  return seat === 'black' || seat === 'white' ? seat : null;
}

function isMyTurn(): boolean {
  const color = myColor();
  return !!snapshot && !!color && snapshot.game.phase === 'playing' && snapshot.game.toMove === color;
}

function renderStatus(): void {
  const pill = el('status-pill');
  pill.classList.toggle('online', status === 'open');
  pill.classList.toggle('offline', status !== 'open');
  pill.textContent = status === 'open' ? t('connected') : status === 'connecting' ? t('connecting') : t('reconnecting');
}

function render(): void {
  renderStatus();
  if (!snapshot) return;

  const game = snapshot.game;
  const color = myColor();

  if (game.moveNumber !== previousMoveNumber) {
    if (color && game.toMove === color && game.phase === 'playing' && previousMoveNumber >= 0) {
      navigator.vibrate?.(40);
    }
    previousMoveNumber = game.moveNumber;
    aim = null;
  }

  renderBoard();
  renderShare();
  renderPlayers();
  renderBanner();
  renderScore();
  renderActions();
}

function renderBoard(): void {
  if (!snapshot) return;
  const game = snapshot.game;
  const view: BoardView = {
    size: game.config.size,
    cells: decodeCells(game.board),
    lastMove: game.lastMove,
    deadStones: new Set(game.deadStones),
    ownership: game.score?.ownership ?? null,
    aim,
    hover,
    playerColor: myColor(),
    showCoordinates: game.config.size <= 19,
    interactive: game.phase === 'playing' && isMyTurn(),
  };
  renderer.draw(view);
}

function renderShare(): void {
  if (!snapshot) return;
  const opponent = myColor() === 'black' ? snapshot.players.white : snapshot.players.black;
  const waiting = opponent.open;
  const box = el('share-box');
  box.classList.toggle('hidden', !waiting || seat === 'observer');
  el('room-code').textContent = snapshot.roomId;
  el('waiting-note').textContent = t('waitingOpponent');
}

function renderPlayers(): void {
  if (!snapshot) return;
  const game = snapshot.game;
  for (const color of ['black', 'white'] as const) {
    const node = el(`player-${color}`);
    const info = snapshot.players[color];
    node.classList.toggle('active', game.phase === 'playing' && game.toMove === color);
    node.classList.toggle('you', seat === color);
    const colorLabel = color === 'black' ? t('black') : t('white');
    node.querySelector('.player-name')!.textContent = info.open
      ? `${colorLabel} — ${t('waitingOpponent')}`
      : info.name || colorLabel;
    const meta: string[] = [`${t('captures')} ${game.captures[color]}`];
    if (!info.open && !info.connected) meta.push(t('offline'));
    node.querySelector('.player-meta')!.textContent = meta.join(' · ');
  }
}

function renderBanner(): void {
  if (!snapshot) return;
  const game = snapshot.game;
  const banner = el('turn-banner');
  const help = el('phase-help');
  banner.classList.remove('active');
  help.textContent = '';

  if (game.phase === 'finished') {
    // Le detail du score est affiche juste en dessous, on evite de le repeter.
    banner.textContent = game.score ? t('gameOver') : `${t('gameOver')} — ${describeResult(game.result)}`;
    return;
  }

  if (game.phase === 'marking') {
    banner.textContent = t('markingTitle');
    help.textContent = t('markingHelp');
    return;
  }

  if (seat === 'observer') {
    banner.textContent = t('observerNotice');
    return;
  }

  const mine = isMyTurn();
  banner.textContent = mine ? t('yourTurn') : t('theirTurn');
  banner.classList.toggle('active', mine);
  if (mine && aim !== null) help.textContent = t('tapToAim');

  const opponentColor = myColor() === 'black' ? 'white' : 'black';
  const opponent = snapshot.players[opponentColor];
  if (!opponent.open && !opponent.connected) help.textContent = t('opponentDisconnected');
}

function describeResult(result: string | null): string {
  if (!result) return '';
  if (result === 'Draw') return t('drawResult');
  if (result.endsWith('+R')) {
    return t('wonByResign')(result.startsWith('B') ? t('black') : t('white'));
  }
  const margin = result.slice(2);
  return result.startsWith('B') ? t('blackWinsBy')(margin) : t('whiteWinsBy')(margin);
}

function renderScore(): void {
  if (!snapshot) return;
  const box = el('score-box');
  const score = snapshot.game.score;
  if (!score) {
    box.classList.add('hidden');
    box.innerHTML = '';
    return;
  }
  box.classList.remove('hidden');
  box.innerHTML = `
    <h3>${describeResult(snapshot.game.result)}</h3>
    <table class="score-table">
      <tr><th></th><th>${t('black')}</th><th>${t('white')}</th></tr>
      <tr><td>${t('scoreStones')}</td><td>${score.blackStones}</td><td>${score.whiteStones}</td></tr>
      <tr><td>${t('scoreTerritory')}</td><td>${score.blackTerritory}</td><td>${score.whiteTerritory}</td></tr>
      <tr><td>${t('scoreKomi')}</td><td>0</td><td>${score.komi}</td></tr>
      <tr><td>${t('scoreTotal')}</td><td>${score.blackScore}</td><td>${score.whiteScore}</td></tr>
    </table>`;
}

function renderActions(): void {
  if (!snapshot) return;
  const actions = el('actions');
  actions.innerHTML = '';
  const color = myColor();
  if (!color) return;

  const game = snapshot.game;

  if (game.phase === 'playing') {
    if (aim !== null) {
      actions.append(
        button(t('confirmMove'), 'primary-button', () => {
          if (aim !== null) client.send({ type: 'move', point: aim });
          aim = null;
          render();
        }),
        button(t('cancelMove'), 'ghost-button', () => {
          aim = null;
          render();
        }),
      );
      return;
    }
    actions.append(
      button(t('pass'), 'ghost-button', () => client.send({ type: 'pass' })),
      button(t('resign'), 'ghost-button danger-button', () => {
        if (confirm(t('resignConfirm'))) client.send({ type: 'resign' });
      }),
    );
    return;
  }

  if (game.phase === 'marking') {
    const confirmed = game.confirmed[color];
    actions.append(
      button(confirmed ? t('waitingConfirm') : t('acceptScore'), 'primary-button', () =>
        client.send({ type: 'confirmScore' }),
      ),
      button(t('resumePlay'), 'ghost-button', () => client.send({ type: 'resumePlay' })),
    );
    if (confirmed) (actions.firstElementChild as HTMLButtonElement).disabled = true;
    return;
  }

  const asked = snapshot.rematch[color];
  actions.append(
    button(asked ? t('rematchWaiting') : t('rematch'), 'primary-button', () => client.send({ type: 'rematch' })),
  );
  if (asked) (actions.firstElementChild as HTMLButtonElement).disabled = true;
}

function button(label: string, className: string, onClick: () => void): HTMLButtonElement {
  const node = document.createElement('button');
  node.type = 'button';
  node.className = className;
  node.textContent = label;
  node.addEventListener('click', onClick);
  return node;
}

/* ------------------------------------------------------------------ */
/* Interactions goban                                                  */
/* ------------------------------------------------------------------ */

function handleBoardPress(event: PointerEvent): void {
  if (!snapshot) return;
  const game = snapshot.game;
  const color = myColor();
  if (!color) return;

  const point = renderer.pointAt(event.clientX, event.clientY);
  if (point === null) return;

  if (game.phase === 'marking') {
    client.send({ type: 'toggleDead', point });
    return;
  }

  if (game.phase !== 'playing' || game.toMove !== color) return;

  const board = decodeBoard(game.board);
  if (board.cells[point] !== EMPTY) {
    showToast(errorMessage('occupied'));
    return;
  }
  const trial = placeStone(board, point, color);
  if (trial.illegal === 'suicide') {
    showToast(errorMessage('suicide'));
    return;
  }

  const needsConfirmation = event.pointerType !== 'mouse';
  if (!needsConfirmation || aim === point) {
    client.send({ type: 'move', point });
    aim = null;
  } else {
    aim = point;
  }
  render();
}

canvas.addEventListener('pointerdown', handleBoardPress);

canvas.addEventListener('pointermove', (event) => {
  if (event.pointerType !== 'mouse') return;
  const point = renderer.pointAt(event.clientX, event.clientY);
  if (point === hover) return;
  hover = point;
  renderBoard();
});

canvas.addEventListener('pointerleave', () => {
  if (hover === null) return;
  hover = null;
  renderBoard();
});

const observer = new ResizeObserver(() => renderer.resize());
observer.observe(canvas.parentElement!);
window.addEventListener('orientationchange', () => setTimeout(() => renderer.resize(), 150));

/* ------------------------------------------------------------------ */
/* Formulaire d'accueil                                                */
/* ------------------------------------------------------------------ */

function wireSegmented(id: string, onSelect: (value: string) => void): void {
  const group = el(id);
  group.addEventListener('click', (event) => {
    const target = (event.target as HTMLElement).closest('button');
    if (!target) return;
    for (const node of group.querySelectorAll('button')) node.classList.remove('selected');
    target.classList.add('selected');
    onSelect(target.dataset.value!);
  });
}

wireSegmented('seg-size', (value) => {
  form.size = Number(value) as BoardSize;
});

wireSegmented('seg-color', (value) => {
  form.color = value as Color | 'random';
});

wireSegmented('seg-first', (value) => {
  form.firstPlayer = value as Color;
});

el<HTMLSelectElement>('select-handicap').addEventListener('change', (event) => {
  form.handicap = Number((event.target as HTMLSelectElement).value);
  form.komi = form.handicap > 0 ? HANDICAP_KOMI : DEFAULT_KOMI;
  el<HTMLInputElement>('input-komi').value = String(form.komi);
  updateFirstPlayerVisibility();
});

el<HTMLInputElement>('input-komi').addEventListener('change', (event) => {
  const value = Number((event.target as HTMLInputElement).value);
  form.komi = Number.isFinite(value) ? Math.round(value * 2) / 2 : DEFAULT_KOMI;
  (event.target as HTMLInputElement).value = String(form.komi);
});

el<HTMLInputElement>('input-name').addEventListener('input', (event) => {
  const name = (event.target as HTMLInputElement).value.trim();
  localStorage.setItem(NAME_KEY, name);
  client.setName(name);
});

function updateFirstPlayerVisibility(): void {
  const handicapped = form.handicap > 0;
  el('field-first-player').classList.toggle('hidden', handicapped);
  el('first-player-hint').textContent = handicapped ? t('handicapForcesWhite') : '';
}

el('btn-create').addEventListener('click', () => {
  const config: Partial<GameConfig> = {
    size: form.size,
    handicap: form.handicap,
    komi: form.komi,
    firstPlayer: form.handicap > 0 ? 'white' : form.firstPlayer,
  };
  client.createGame(config, form.color);
});

el('btn-join').addEventListener('click', () => {
  const code = el<HTMLInputElement>('input-code').value.trim().toUpperCase();
  if (code.length < 3) return;
  client.joinGame(code);
});

el<HTMLInputElement>('input-code').addEventListener('keydown', (event) => {
  if (event.key === 'Enter') el('btn-join').click();
});

el('btn-copy').addEventListener('click', async () => {
  if (!snapshot) return;
  const link = shareLink(snapshot.roomId);
  try {
    await navigator.clipboard.writeText(link);
    showToast(t('copied'));
  } catch {
    prompt(t('copyLink'), link);
  }
});

const shareButton = el('btn-share');
if (typeof navigator.share === 'function') {
  shareButton.classList.remove('hidden');
  shareButton.addEventListener('click', () => {
    if (!snapshot) return;
    void navigator.share({ title: 'Go', text: `${t('joinGame')} : ${snapshot.roomId}`, url: shareLink(snapshot.roomId) });
  });
}

el('btn-home').addEventListener('click', () => {
  client.leaveGame();
  snapshot = null;
  seat = null;
  aim = null;
  const url = new URL(location.href);
  url.searchParams.delete('g');
  history.replaceState(null, '', url);
  showScreen('home');
});

el('lang-toggle').addEventListener('click', () => {
  const next: Lang = getLang() === 'fr' ? 'en' : 'fr';
  setLang(next);
  applyTranslations();
});

function shareLink(roomId: string): string {
  return `${location.origin}${location.pathname}?g=${roomId}`;
}

/* ------------------------------------------------------------------ */
/* Demarrage                                                           */
/* ------------------------------------------------------------------ */

el<HTMLInputElement>('input-name').value = localStorage.getItem(NAME_KEY) ?? '';
el<HTMLInputElement>('input-komi').value = String(form.komi);
applyTranslations();
updateFirstPlayerVisibility();
renderStatus();
client.connect();

const initialRoom = new URL(location.href).searchParams.get('g');
if (initialRoom) {
  el<HTMLInputElement>('input-code').value = initialRoom.toUpperCase();
  client.joinGame(initialRoom);
}

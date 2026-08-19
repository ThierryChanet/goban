export type Lang = 'fr' | 'en';

const fr = {
  appTitle: 'Go',
  tagline: 'Jouez au Go a deux, chacun sur son ecran.',
  language: 'Langue',

  newGame: 'Nouvelle partie',
  createGame: 'Creer la partie',
  joinGame: 'Rejoindre une partie',
  roomCode: 'Code de la partie',
  roomCodePlaceholder: 'K7M2P',
  join: 'Rejoindre',
  yourName: 'Votre nom',
  namePlaceholder: 'Optionnel',

  boardSize: 'Taille du goban',
  size9: '9x9 (rapide)',
  size13: '13x13',
  size19: '19x19 (complet)',
  handicap: 'Handicap',
  handicapNone: 'Aucun (partie a egalite)',
  handicapStones: (n: number) => `${n} pierres pour Noir`,
  komi: 'Komi (points pour Blanc)',
  komiHint: 'Compense l’avantage du premier coup.',
  yourColor: 'Vous jouez',
  firstPlayer: 'Qui commence',
  black: 'Noir',
  white: 'Blanc',
  random: 'Au hasard',
  blackFirst: 'Noir commence',
  whiteFirst: 'Blanc commence',
  handicapForcesWhite: 'Avec handicap, Noir pose ses pierres et Blanc joue le premier coup.',
  rules: 'Regles : comptage chinois (surface), super-ko positionnel.',

  share: 'Invitez votre adversaire',
  shareHint: 'Envoyez ce lien ou dictez le code.',
  copyLink: 'Copier le lien',
  copied: 'Copie !',
  waitingOpponent: 'En attente de l’adversaire...',
  opponentDisconnected: 'Adversaire deconnecte, la partie l’attend.',

  youAre: 'Vous jouez',
  observerNotice: 'Vous observez cette partie.',
  yourTurn: 'A vous de jouer',
  theirTurn: 'Au tour de l’adversaire',
  moveNumber: 'Coup',
  captures: 'Prisonniers',
  pass: 'Passer',
  undoMove: 'Annuler le coup',
  undoHint: 'Reprend le dernier coup joue, quel qu’en soit l’auteur.',
  endMenu: 'Fin de partie',
  closeMenu: 'Retour',
  countNow: 'Compter les points',
  countNowHint: 'Arrete la partie en l’etat et passe au comptage. Ce n’est pas un abandon : votre adversaire peut refuser et la partie repartira ou elle en etait.',
  resign: 'Abandonner',
  resignConfirm: 'Abandonner la partie ?',
  confirmMove: 'Confirmer',
  cancelMove: 'Annuler',
  tapToAim: 'Touchez une intersection, puis confirmez.',

  markingTitle: 'Comptage',
  markingHelp: 'Touchez les groupes morts pour les retirer, puis validez. Les deux joueurs doivent etre d’accord.',
  acceptScore: 'Valider le score',
  waitingConfirm: 'En attente de la validation de l’adversaire...',
  resumePlay: 'Reprendre la partie',

  gameOver: 'Partie terminee',
  result: 'Resultat',
  blackWinsBy: (n: string) => `Noir gagne de ${n} points`,
  whiteWinsBy: (n: string) => `Blanc gagne de ${n} points`,
  drawResult: 'Partie nulle',
  wonByResign: (c: string) => `${c} gagne par abandon`,
  scoreStones: 'Pierres',
  scoreTerritory: 'Territoire',
  scoreKomi: 'Komi',
  scoreTotal: 'Total',
  rematch: 'Revanche',
  rematchWaiting: 'Revanche proposee, en attente de l’adversaire...',
  backHome: 'Nouvelle partie',

  connecting: 'Connexion...',
  connected: 'Connecte',
  reconnecting: 'Reconnexion...',
  offline: 'Hors ligne',

  err_not_your_turn: 'Ce n’est pas votre tour.',
  err_occupied: 'Intersection deja occupee.',
  err_suicide: 'Coup interdit : suicide.',
  err_ko: 'Coup interdit : ko.',
  err_out_of_bounds: 'Coup hors du goban.',
  err_wrong_phase: 'Action impossible a ce stade de la partie.',
  err_not_a_stone: 'Il n’y a pas de pierre ici.',
  err_nothing_to_undo: 'Aucun coup a annuler.',
  err_room_not_found: 'Partie introuvable. Verifiez le code.',
  err_room_full: 'Cette partie est complete.',
  err_not_seated: 'Vous observez cette partie, vous ne pouvez pas jouer.',
  err_not_in_room: 'Vous n’etes dans aucune partie.',
  err_bad_message: 'Message invalide.',
  err_rate_limited: 'Trop d’actions, patientez un instant.',
  err_server_error: 'Erreur du serveur.',
};

type Dict = typeof fr;

const en: Dict = {
  appTitle: 'Go',
  tagline: 'Play Go with a friend, each on your own screen.',
  language: 'Language',

  newGame: 'New game',
  createGame: 'Create game',
  joinGame: 'Join a game',
  roomCode: 'Game code',
  roomCodePlaceholder: 'K7M2P',
  join: 'Join',
  yourName: 'Your name',
  namePlaceholder: 'Optional',

  boardSize: 'Board size',
  size9: '9x9 (quick)',
  size13: '13x13',
  size19: '19x19 (full)',
  handicap: 'Handicap',
  handicapNone: 'None (even game)',
  handicapStones: (n: number) => `${n} stones for Black`,
  komi: 'Komi (points for White)',
  komiHint: 'Compensates the first-move advantage.',
  yourColor: 'You play',
  firstPlayer: 'Who starts',
  black: 'Black',
  white: 'White',
  random: 'Random',
  blackFirst: 'Black starts',
  whiteFirst: 'White starts',
  handicapForcesWhite: 'With a handicap, Black places stones first and White makes the first move.',
  rules: 'Rules: Chinese (area) scoring, positional superko.',

  share: 'Invite your opponent',
  shareHint: 'Send this link or read out the code.',
  copyLink: 'Copy link',
  copied: 'Copied!',
  waitingOpponent: 'Waiting for your opponent...',
  opponentDisconnected: 'Opponent disconnected, the game is waiting for them.',

  youAre: 'You play',
  observerNotice: 'You are watching this game.',
  yourTurn: 'Your turn',
  theirTurn: 'Opponent’s turn',
  moveNumber: 'Move',
  captures: 'Captures',
  pass: 'Pass',
  undoMove: 'Undo move',
  undoHint: 'Takes back the last move played, by either player.',
  endMenu: 'End the game',
  closeMenu: 'Back',
  countNow: 'Count the score',
  countNowHint: 'Stops the game as it stands and moves to scoring. This is not a resignation: your opponent can decline and play resumes exactly where it left off.',
  resign: 'Resign',
  resignConfirm: 'Resign this game?',
  confirmMove: 'Confirm',
  cancelMove: 'Cancel',
  tapToAim: 'Tap an intersection, then confirm.',

  markingTitle: 'Scoring',
  markingHelp: 'Tap dead groups to remove them, then accept. Both players must agree.',
  acceptScore: 'Accept score',
  waitingConfirm: 'Waiting for your opponent to accept...',
  resumePlay: 'Resume play',

  gameOver: 'Game over',
  result: 'Result',
  blackWinsBy: (n: string) => `Black wins by ${n} points`,
  whiteWinsBy: (n: string) => `White wins by ${n} points`,
  drawResult: 'Draw',
  wonByResign: (c: string) => `${c} wins by resignation`,
  scoreStones: 'Stones',
  scoreTerritory: 'Territory',
  scoreKomi: 'Komi',
  scoreTotal: 'Total',
  rematch: 'Rematch',
  rematchWaiting: 'Rematch offered, waiting for your opponent...',
  backHome: 'New game',

  connecting: 'Connecting...',
  connected: 'Connected',
  reconnecting: 'Reconnecting...',
  offline: 'Offline',

  err_not_your_turn: 'It is not your turn.',
  err_occupied: 'That intersection is taken.',
  err_suicide: 'Illegal move: suicide.',
  err_ko: 'Illegal move: ko.',
  err_out_of_bounds: 'Move outside the board.',
  err_wrong_phase: 'Not possible at this stage of the game.',
  err_not_a_stone: 'There is no stone here.',
  err_nothing_to_undo: 'No move to undo.',
  err_room_not_found: 'Game not found. Check the code.',
  err_room_full: 'This game is full.',
  err_not_seated: 'You are watching this game and cannot play.',
  err_not_in_room: 'You are not in a game.',
  err_bad_message: 'Invalid message.',
  err_rate_limited: 'Too many actions, please wait a moment.',
  err_server_error: 'Server error.',
};

const dictionaries: Record<Lang, Dict> = { fr, en };

let current: Lang = detectLang();

function detectLang(): Lang {
  const stored = localStorage.getItem('go:lang');
  if (stored === 'fr' || stored === 'en') return stored;
  return navigator.language.toLowerCase().startsWith('fr') ? 'fr' : 'en';
}

export function getLang(): Lang {
  return current;
}

export function setLang(lang: Lang): void {
  current = lang;
  localStorage.setItem('go:lang', lang);
  document.documentElement.lang = lang;
}

export function t<K extends keyof Dict>(key: K): Dict[K] {
  return dictionaries[current][key];
}

/** Message d'erreur traduit a partir du code renvoye par le serveur. */
export function errorMessage(code: string): string {
  const key = `err_${code}` as keyof Dict;
  const value = dictionaries[current][key];
  return typeof value === 'string' ? value : dictionaries[current].err_server_error;
}

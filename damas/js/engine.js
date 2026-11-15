// Motor de Damas — Regras Brasileiras (Confederação Brasileira de Damas)
// - Tabuleiro 8x8, 12 peças por lado, brancas começam
// - Pedras andam 1 casa para frente na diagonal e capturam para frente e para trás
// - Captura obrigatória + Lei da Maioria (deve capturar o maior número de peças)
// - Dama "voadora": anda e captura a qualquer distância na diagonal
// - Peças capturadas só saem do tabuleiro ao fim do lance (não podem ser saltadas 2x)
// - Pedra que passa pela última linha durante captura e continua capturando NÃO é promovida
// - Empate: 20 lances seguidos só de damas sem captura

export const WHITE = 1, BLACK = -1;
export const MAN = 1, KING = 2;
const DIRS = [[-1, -1], [-1, 1], [1, -1], [1, 1]];

export const idx = (r, c) => r * 8 + c;
export const rc = (i) => [i >> 3, i & 7];
const inside = (r, c) => r >= 0 && r < 8 && c >= 0 && c < 8;
export const isDark = (r, c) => (r + c) % 2 === 1;
export const colorOf = (p) => (p > 0 ? WHITE : p < 0 ? BLACK : 0);

export function initialBoard() {
  const b = new Array(64).fill(0);
  for (let r = 0; r < 8; r++)
    for (let c = 0; c < 8; c++) {
      if (!isDark(r, c)) continue;
      if (r < 3) b[idx(r, c)] = -MAN;
      else if (r > 4) b[idx(r, c)] = MAN;
    }
  return b;
}

export function newGame() {
  return { board: initialBoard(), turn: WHITE, quiet: 0, ply: 0, winner: null, reason: null, last: null };
}

function capturesFrom(board, from, piece) {
  const color = colorOf(piece);
  const king = Math.abs(piece) === KING;
  const results = [];
  const b = board.slice();
  b[from] = 0;

  function dfs(pos, path, captured) {
    const [r, c] = rc(pos);
    let extended = false;
    for (const [dr, dc] of DIRS) {
      if (!king) {
        const mr = r + dr, mc = c + dc, lr = r + 2 * dr, lc = c + 2 * dc;
        if (!inside(lr, lc)) continue;
        const mi = idx(mr, mc), li = idx(lr, lc);
        if (colorOf(b[mi]) === -color && !captured.includes(mi) && b[li] === 0) {
          extended = true;
          dfs(li, [...path, li], [...captured, mi]);
        }
      } else {
        let cr = r + dr, cc = c + dc;
        while (inside(cr, cc) && b[idx(cr, cc)] === 0) { cr += dr; cc += dc; }
        if (!inside(cr, cc)) continue;
        const mi = idx(cr, cc);
        if (colorOf(b[mi]) !== -color || captured.includes(mi)) continue;
        let lr = cr + dr, lc = cc + dc;
        while (inside(lr, lc) && b[idx(lr, lc)] === 0) {
          const li = idx(lr, lc);
          extended = true;
          dfs(li, [...path, li], [...captured, mi]);
          lr += dr; lc += dc;
        }
      }
    }
    if (!extended && captured.length) results.push({ from, path, captured });
  }
  dfs(from, [], []);
  return results;
}

function simpleFrom(board, from, piece) {
  const color = colorOf(piece);
  const king = Math.abs(piece) === KING;
  const [r, c] = rc(from);
  const out = [];
  for (const [dr, dc] of DIRS) {
    if (!king) {
      if (dr !== (color === WHITE ? -1 : 1)) continue;
      const nr = r + dr, nc = c + dc;
      if (inside(nr, nc) && board[idx(nr, nc)] === 0) out.push({ from, path: [idx(nr, nc)], captured: [] });
    } else {
      let nr = r + dr, nc = c + dc;
      while (inside(nr, nc) && board[idx(nr, nc)] === 0) {
        out.push({ from, path: [idx(nr, nc)], captured: [] });
        nr += dr; nc += dc;
      }
    }
  }
  return out;
}

export function legalMoves(board, color) {
  let caps = [];
  for (let i = 0; i < 64; i++) {
    if (colorOf(board[i]) !== color) continue;
    caps.push(...capturesFrom(board, i, board[i]));
  }
  if (caps.length) {
    const max = Math.max(...caps.map((m) => m.captured.length));
    caps = caps.filter((m) => m.captured.length === max);
    // remove duplicados (mesmo caminho/capturas)
    const seen = new Set();
    caps = caps.filter((m) => {
      const k = m.from + ':' + m.path.join(',') + ':' + [...m.captured].sort().join(',');
      if (seen.has(k)) return false;
      seen.add(k); return true;
    });
    return caps;
  }
  const out = [];
  for (let i = 0; i < 64; i++) if (colorOf(board[i]) === color) out.push(...simpleFrom(board, i, board[i]));
  return out;
}

export const moveTo = (m) => m.path[m.path.length - 1];

export function applyMoveToBoard(board, m) {
  const b = board.slice();
  const piece = b[m.from];
  b[m.from] = 0;
  for (const ci of m.captured) b[ci] = 0;
  const to = moveTo(m);
  const [tr] = rc(to);
  let p = piece;
  if (Math.abs(p) === MAN && ((p > 0 && tr === 0) || (p < 0 && tr === 7))) p = p * 2;
  b[to] = p;
  return b;
}

export function applyMove(state, m) {
  const piece = state.board[m.from];
  const board = applyMoveToBoard(state.board, m);
  const promoted = Math.abs(board[moveTo(m)]) !== Math.abs(piece);
  const kingQuiet = Math.abs(piece) === KING && m.captured.length === 0;
  const s = {
    board,
    turn: -state.turn,
    quiet: kingQuiet ? state.quiet + 1 : 0,
    ply: state.ply + 1,
    winner: null,
    reason: null,
    last: { from: m.from, to: moveTo(m), path: m.path, captured: m.captured, promoted },
  };
  const next = legalMoves(board, s.turn);
  if (!next.length) {
    s.winner = state.turn;
    const left = board.some((p) => colorOf(p) === s.turn);
    s.reason = left ? 'bloqueio' : 'capturas';
  } else if (s.quiet >= 40) {
    s.winner = 0; s.reason = 'empate20';
  }
  return s;
}

export function sameMove(a, b) {
  return a && b && a.from === b.from && a.path.join(',') === b.path.join(',') && a.captured.join(',') === b.captured.join(',');
}

export function countPieces(board) {
  let w = 0, b = 0, wk = 0, bk = 0;
  for (const p of board) {
    if (p > 0) { w++; if (p === KING) wk++; }
    else if (p < 0) { b++; if (p === -KING) bk++; }
  }
  return { w, b, wk, bk };
}

// ---------------- IA ----------------
const CENTER = [0, 0, 1, 2, 2, 1, 0, 0];
function evaluate(board, color) {
  let score = 0;
  let mine = 0, theirs = 0;
  for (let i = 0; i < 64; i++) {
    const p = board[i];
    if (!p) continue;
    const [r, c] = rc(i);
    const col = colorOf(p);
    let v;
    if (Math.abs(p) === KING) v = 320 + CENTER[c] * 4 + CENTER[r] * 4;
    else {
      const adv = col === WHITE ? 7 - r : r; // 0..7
      v = 100 + adv * adv * 0.9 + CENTER[c] * 3;
      if ((col === WHITE && r === 7) || (col === BLACK && r === 0)) v += 12; // guarda da última linha
      if (c === 0 || c === 7) v -= 4;
    }
    if (col === color) { score += v; mine++; } else { score -= v; theirs++; }
  }
  // quando à frente, troque peças
  if (mine + theirs > 0) score += (score > 0 ? 1 : -1) * (24 - mine - theirs) * 2;
  return score;
}

export function searchBest(state, { depth = 6, timeMs = 1200, randomness = 0 } = {}) {
  const color = state.turn;
  const moves = legalMoves(state.board, color);
  if (!moves.length) return null;
  if (moves.length === 1) return moves[0];
  const start = Date.now();
  let timeUp = false;
  let nodes = 0;

  function negamax(board, turn, d, alpha, beta, ply) {
    if ((++nodes & 1023) === 0 && Date.now() - start > timeMs) timeUp = true;
    if (timeUp) return 0;
    const ms = legalMoves(board, turn);
    if (!ms.length) return -100000 + ply;
    // extensão de captura (quiescência simples)
    if (d <= 0 && !(ms[0].captured.length && d > -6)) return evaluate(board, turn);
    let best = -Infinity;
    ms.sort((a, b) => b.captured.length - a.captured.length);
    for (const m of ms) {
      const v = -negamax(applyMoveToBoard(board, m), -turn, d - 1, -beta, -alpha, ply + 1);
      if (v > best) best = v;
      if (v > alpha) alpha = v;
      if (alpha >= beta) break;
    }
    return best;
  }

  let bestMove = moves[0];
  let scored = moves.map((m) => ({ m, v: 0 }));
  for (let d = 1; d <= depth; d++) {
    const cur = [];
    let alpha = -Infinity;
    for (const { m } of scored) {
      const v = -negamax(applyMoveToBoard(state.board, m), -color, d - 1, -Infinity, randomness > 0 ? Infinity : -alpha, 1);
      if (timeUp) break;
      cur.push({ m, v });
      if (v > alpha) alpha = v;
    }
    if (timeUp) break;
    cur.sort((a, b) => b.v - a.v);
    scored = cur;
    bestMove = cur[0].m;
  }
  if (randomness > 0 && scored.length > 1) {
    const top = scored[0].v;
    const pool = scored.filter((s) => s.v >= top - randomness);
    bestMove = pool[Math.floor(Math.random() * pool.length)].m;
  }
  return bestMove;
}

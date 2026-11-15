import { searchBest } from './engine.js';

const LEVELS = {
  facil: { depth: 2, timeMs: 300, randomness: 60 },
  medio: { depth: 5, timeMs: 700, randomness: 8 },
  dificil: { depth: 12, timeMs: 1600, randomness: 0 },
};

self.onmessage = (e) => {
  const { id, state, level } = e.data;
  const move = searchBest(state, LEVELS[level] || LEVELS.medio);
  self.postMessage({ id, move });
};

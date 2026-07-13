/**
 * シード付きPRNG（v3のcreateRngと同一実装）。
 * mulberry32定数(0x6d2b79f5)を用いるsplitmix系変種。戻り値は[0, 1)。
 * ゲーム内の乱数はすべて本関数経由で生成する（Math.random禁止。R8: 決定論）。
 */

export type Rng = () => number;

export const createRng = (seed: number): Rng => {
  let s = seed | 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

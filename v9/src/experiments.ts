/**
 * 実験レジストリ。名前付きの実験（初期状態configとパラメータ）を一元管理する。
 * GUI（ui/）とCLI（cli.ts）の双方から参照できる。
 */

import { DEFAULT_GAME_PARAMS } from './params';
import type { GameParams } from './params';
import { buildAncestorConfig } from './programs/ancestor-config';
import { buildCompetitionConfig } from './programs/competition-config';
import { buildExpanderConfig } from './programs/expander';
import { buildLongevousConfig } from './programs/longevous';
import { buildMobileConfig } from './programs/mobile';
import { buildPredationConfig } from './programs/predation-config';
import { buildRepairerConfig } from './programs/repairer';
import type { InitialConfig } from './sim/initial-state';

/** 移動種は散在資源＋潤沢なエネルギーの環境を前提とする */
export const MOBILE_PARAMS: GameParams = {
  ...DEFAULT_GAME_PARAMS,
  nodeAmountByAbundance: { abundant: 4000, common: 2000, limited: 1000, rare: 200 },
  energyNodeCount: 60,
};

/**
 * 録画用の世界。長命移動複製種を**資源の薄い世界**に置く。
 *
 * 既定の世界（MOBILE_PARAMS）では資源ノードの枯渇がt≈13,500、個体数が44まで増えるため、
 * 録画枠（60〜90秒）に「誕生→増殖→枯渇→死→崩壊→還流」が収まらず、画面も団子になる。
 * ノード1個あたりの量とエネルギーノード数を減らすと、6つの現象が約10,000tick・
 * ピーク8個体で順に出る。**減らすのは量だけで、ノード数・物理・保存則は既定のまま**である。
 */
export const RECORDING_PARAMS: GameParams = {
  ...DEFAULT_GAME_PARAMS,
  nodeAmountByAbundance: { abundant: 300, common: 150, limited: 80, rare: 24 },
  energyNodeCount: 24,
};

/**
 * 実験09（進化の探索）用の世界。資源ノード1個あたりの量を移動種の世界の10倍にする。
 *
 * 目的は**世代数を稼ぐこと**である。実験08 の実測では、既定の世界は t≈50,000 で
 * 希少資源（情報原子）を使い切り、以後は個体数が縮小する。淘汰の方向を測るには
 * その前に十分な世代交代が要る。
 *
 * **希少度の順序（abundant > common > limited > rare）は保っている。**
 * rare を rare でなくすと「希少資源の探索が繁殖速度の律速」という設定の目的に反するため、
 * 全等級を一律10倍にして相対的な希少さを変えない。既定値（DEFAULT_GAME_PARAMS）と
 * 移動種の世界（MOBILE_PARAMS）は書き換えていない。
 */
export const EVOLUTION_PARAMS: GameParams = {
  ...DEFAULT_GAME_PARAMS,
  nodeAmountByAbundance: { abundant: 40000, common: 20000, limited: 10000, rare: 2000 },
  energyNodeCount: 60,
};

/** 自己修復種は希少資源が潤沢な環境で寿命延長がはっきり見える */
export const RICH_PARAMS: GameParams = {
  ...DEFAULT_GAME_PARAMS,
  nodeAmountByAbundance: { abundant: 40000, common: 20000, limited: 20000, rare: 20000 },
};

export interface Experiment {
  readonly id: string;
  readonly label: string;
  readonly description: string;
  readonly build: (seed: number) => InitialConfig;
  readonly params: GameParams;
  readonly defaultSeed: number;
}

export const EXPERIMENTS: readonly Experiment[] = [
  {
    id: 'ancestor',
    label: '祖先種の自己複製',
    description: '最小祖先(4部品)がクレードルの資源で子を複製する（実験01）',
    build: seed => buildAncestorConfig(seed),
    params: DEFAULT_GAME_PARAMS,
    defaultSeed: 42,
  },
  {
    id: 'ancestor-mutate',
    label: '祖先種（意図的変異）',
    description: 'プログラム自身が複製時に1ビット変異を入れる（実験03）',
    build: seed => buildAncestorConfig(seed, { mutation: true, mutationGateMask: 3, seedSalt: 2 }),
    params: RICH_PARAMS,
    defaultSeed: 42,
  },
  {
    id: 'expander',
    label: '自己拡張種',
    description: '子を作らず自身にコンポーネントを接続して成長する（実験04）',
    build: seed => buildExpanderConfig(seed, 4),
    params: DEFAULT_GAME_PARAMS,
    defaultSeed: 42,
  },
  {
    id: 'repairer',
    label: '自己修復種',
    description: '器官をREPAIRで維持し寿命を延ばす（実験04）',
    build: seed => buildRepairerConfig(seed, true),
    params: RICH_PARAMS,
    defaultSeed: 42,
  },
  {
    id: 'predation',
    label: '捕食',
    description: '捕食者がコロニーを探知・追跡・分解する（実験02）',
    build: seed => buildPredationConfig(seed),
    params: DEFAULT_GAME_PARAMS,
    defaultSeed: 42,
  },
  {
    id: 'mobile',
    label: '移動複製種',
    description: '探索採取で世界を移動し複製、局所枯渇から脱出（実験06）',
    build: seed => buildMobileConfig(seed),
    params: MOBILE_PARAMS,
    defaultSeed: 42,
  },
  {
    id: 'longevous',
    label: '長命移動複製種',
    description: '4個体から始まり、器官を修理しながら繁殖を続ける（実験08）',
    build: seed => buildLongevousConfig(seed),
    params: MOBILE_PARAMS,
    // 40シードを走査して20000tickの累計誕生数が最大だったシード（実験08）
    defaultSeed: 26,
  },
  {
    id: 'recording',
    label: '録画用（生態のサイクル）',
    description: '資源の薄い世界で誕生・増殖・枯渇・死・崩壊・還流が順に起きる（実験08の観察用）',
    build: seed => buildLongevousConfig(seed),
    params: RECORDING_PARAMS,
    // 台本ツール（src/tools/recording-script.ts --survey）で選んだシード。
    // 6現象が t=2,093〜10,844 に順に出て、死→崩壊→還流が同じ場所で続く
    defaultSeed: 5,
  },
  {
    id: 'evolution',
    label: '進化する形質',
    description: '振る舞いを決める値がゲノムに載り、複製時に区画限定の変異を受ける（実験09）。変異率1/2で、下の「形質の進化（最良シード）」とは条件が違う',
    build: seed => buildLongevousConfig(seed, { evolvable: { gateMask: 1 } }),
    params: EVOLUTION_PARAMS,
    defaultSeed: 26,
  },
  // 以下3項は実験09の本番条件（gateMask 0 = 毎回1形質が動く）。
  // CLI（src/tools/evolution-run.ts）と同じ入口 buildLongevousConfig を使う
  {
    id: 'evolution-param-best',
    label: '形質の進化（最良シード）',
    description: '形質が複製ごとに必ず1つ変異する（実験09の本番条件）。全19本で累計誕生数が最大のシード',
    build: seed => buildLongevousConfig(seed, { evolvable: { target: 'param', gateMask: 0 } }),
    params: EVOLUTION_PARAMS,
    // 実験09: 60000tickで累計誕生164・最大同時54
    defaultSeed: 12,
  },
  {
    id: 'evolution-plan',
    label: '振る舞いの進化（工程表の変異）',
    description: '工程表が複製ごとに必ず1箇所変異する（実験09の本番条件）。工程表の腕で累計誕生数が最大のシード',
    build: seed => buildLongevousConfig(seed, { evolvable: { target: 'plan', gateMask: 0 } }),
    params: EVOLUTION_PARAMS,
    // 実験09: 60000tickで累計誕生116・最大同時40
    defaultSeed: 26,
  },
  {
    id: 'evolution-param-mobile-world',
    label: '形質の進化（資源を増やさない世界）',
    description: '「形質の進化」を移動種の世界（資源10倍なし）で走らせる対照。個体間の競合が強い（実験09）',
    build: seed => buildLongevousConfig(seed, { evolvable: { target: 'param', gateMask: 0 } }),
    params: MOBILE_PARAMS,
    // 実験09: 60000tickで累計誕生87・最大同時43
    defaultSeed: 26,
  },
  {
    id: 'competition',
    label: '空間競争（移動 vs 定住）',
    description: '移動種と定住種が同じ世界で資源を奪い合う（実験07）',
    build: seed => buildCompetitionConfig(seed),
    params: MOBILE_PARAMS,
    defaultSeed: 2,
  },
];

export const experimentById = (id: string): Experiment =>
  EXPERIMENTS.find(e => e.id === id) ?? EXPERIMENTS[0];

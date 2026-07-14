/**
 * 実験レジストリ。名前付きの実験（初期状態configとパラメータ）を一元管理する。
 * GUI（ui/）とCLI（cli.ts）の双方から参照できる。
 */

import { DEFAULT_GAME_PARAMS } from './params';
import type { GameParams } from './params';
import { buildAncestorConfig } from './programs/ancestor-config';
import { buildCompetitionConfig } from './programs/competition-config';
import { buildExpanderConfig } from './programs/expander';
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

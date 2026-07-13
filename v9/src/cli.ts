/**
 * ヘッドレスCLI実行。
 * 使い方:
 *   npm run sim -- --config <path.json> --ticks 1000 [--seed 42] [--output summary|events]
 *   npm run sim -- --demo --ticks 200
 */

import { readFileSync } from 'node:fs';
import { DEFAULT_GAME_PARAMS } from './params';
import { buildAncestorConfig } from './programs/ancestor-config';
import { buildPredationConfig } from './programs/predation-config';
import { createRng } from './rng';
import { formatAtomTotals, totalAtoms, totalEnergy } from './sim/accounting';
import { buildInitialWorld, initialConfigSchema } from './sim/initial-state';
import type { InitialConfig } from './sim/initial-state';
import { runTicks } from './sim/simulation';
import type { World } from './sim/types';
import { isWreck } from './sim/types';
import { GAME_VERSION } from './version';

interface CliOptions {
  readonly configPath?: string;
  readonly demo: boolean;
  readonly ancestor: boolean;
  readonly mutate: boolean;
  readonly predation: boolean;
  readonly ticks: number;
  readonly seed?: number;
  readonly output: 'summary' | 'events';
}

const parseArgs = (argv: string[]): CliOptions => {
  let configPath: string | undefined;
  let demo = false;
  let ancestor = false;
  let mutate = false;
  let predation = false;
  let ticks = 100;
  let seed: number | undefined;
  let output: CliOptions['output'] = 'summary';
  for (let i = 0; i < argv.length; i++) {
    switch (argv[i]) {
      case '--config':
        configPath = argv[++i];
        break;
      case '--demo':
        demo = true;
        break;
      case '--ancestor':
        ancestor = true;
        break;
      case '--ancestor-mutate':
        ancestor = true;
        mutate = true;
        break;
      case '--predation':
        predation = true;
        break;
      case '--ticks':
        ticks = Number(argv[++i]);
        break;
      case '--seed':
        seed = Number(argv[++i]);
        break;
      case '--output':
        output = argv[++i] as CliOptions['output'];
        break;
      default:
        break;
    }
  }
  return { configPath, demo, ancestor, mutate, predation, ticks, seed, output };
};

/** デモ設定: 最小祖先の構成（プログラムなし・放置観察用） */
const demoConfig = (seed: number): InitialConfig => ({
  seed,
  autoNodes: true,
  ancestors: [
    {
      x: 50,
      y: 50,
      cradle: true,
      components: [
        { type: 'Processor' },
        { type: 'Assembler' },
        { type: 'Storage', energy: 1000 },
        { type: 'Harvester' },
      ],
      connections: [
        [0, 1, 0],
        [1, 2, 1],
        [2, 3, 2],
      ],
    },
  ],
});

const printSummary = (world: World): void => {
  const components = world.objects.filter(o => o.kind === 'component');
  const byType = new Map<string, { active: number; wrecks: number }>();
  for (const obj of components) {
    if (obj.kind !== 'component') continue;
    const entry = byType.get(obj.componentType) ?? { active: 0, wrecks: 0 };
    if (isWreck(obj)) entry.wrecks += 1;
    else entry.active += 1;
    byType.set(obj.componentType, entry);
  }
  const groups = world.objects.filter(o => o.kind === 'group');
  const running = components.filter(
    o => o.kind === 'component' && o.componentType === 'Processor' && !isWreck(o) && o.running,
  ).length;

  console.log(`=== v${GAME_VERSION.toString()} simulation summary ===`);
  console.log(`tick: ${world.tick}`);
  console.log(`objects: ${world.objects.length}`);
  console.log(
    `  components: ${components.length} (running processors: ${running})`,
  );
  for (const [componentType, entry] of [...byType.entries()].sort()) {
    console.log(`    ${componentType}: active=${entry.active} wrecks=${entry.wrecks}`);
  }
  console.log(`  groups: ${groups.length}`);
  console.log(`  matterNodes: ${world.objects.filter(o => o.kind === 'matterNode').length}`);
  console.log(`  energyNodes: ${world.objects.filter(o => o.kind === 'energyNode').length}`);
  console.log(`  ground piles: ${world.objects.filter(o => o.kind === 'ground').length}`);
  console.log(`atoms: ${formatAtomTotals(totalAtoms(world))}`);
  console.log(`stored energy: ${totalEnergy(world)}`);
};

const main = (): void => {
  const options = parseArgs(process.argv.slice(2));

  let config: InitialConfig;
  if (options.configPath !== undefined) {
    const raw: unknown = JSON.parse(readFileSync(options.configPath, 'utf-8'));
    config = initialConfigSchema.parse(raw);
  } else if (options.predation) {
    config = buildPredationConfig(options.seed ?? 42);
  } else if (options.ancestor) {
    config = buildAncestorConfig(options.seed ?? 42, { mutation: options.mutate });
  } else if (options.demo) {
    config = demoConfig(options.seed ?? 42);
  } else {
    console.log(
      'usage: npm run sim -- (--config <path.json> | --demo | --ancestor | --ancestor-mutate | --predation) [--ticks N] [--seed N] [--output summary|events]',
    );
    process.exitCode = 1;
    return;
  }

  const seed = options.seed ?? config.seed;
  const rng = createRng(seed);
  const params = DEFAULT_GAME_PARAMS;
  let world = buildInitialWorld({ ...config, seed }, params, rng);

  console.log(`seed=${seed} ticks=${options.ticks} initial atoms: ${formatAtomTotals(totalAtoms(world))}`);
  world = runTicks(world, params, rng, options.ticks, result => {
    if (options.output === 'events') {
      for (const event of result.events) {
        console.log(`[tick ${result.world.tick - 1}] ${JSON.stringify(event)}`);
      }
    }
  });
  printSummary(world);
};

main();

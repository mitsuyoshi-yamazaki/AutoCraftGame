import { describe, expect, it } from 'vitest';
import { createRng } from '../src/rng';
import { buildPredationConfig, PREDATOR_WAKE_TICK } from '../src/programs/predation-config';
import { formatAtomTotals, totalAtoms } from '../src/sim/accounting';
import { substanceCodeOf } from '../src/sim/codes';
import { buildInitialWorld } from '../src/sim/initial-state';
import { executeTick } from '../src/sim/simulation';
import type { SimulationEvent, StorageComponent } from '../src/sim/types';
import { makeParams } from './sim-helpers';

describe('捕食実験（R5）', () => {
  it('捕食者がコロニーへ移動してProcessorを分解し、情報系素材を回収する', () => {
    const params = makeParams();
    const config = buildPredationConfig(42);
    const rng = createRng(config.seed);
    let world = buildInitialWorld(config, params, rng);
    const initialAtoms = formatAtomTotals(totalAtoms(world));

    const kills: SimulationEvent[] = [];
    let colonyProcessorsAtWake = 0;
    for (let i = 0; i < 3500; i++) {
      const result = executeTick(world, params, rng);
      world = result.world;
      for (const event of result.events) {
        if (event.type === 'component_removed' && event.cause === 'disassembled') {
          kills.push(event);
        }
      }
      if (world.tick === PREDATOR_WAKE_TICK) {
        colonyProcessorsAtWake = world.objects.filter(
          o => o.kind === 'component' && o.componentType === 'Processor',
        ).length;
      }
    }

    // 捕食（分解による除去）が起きている。獲物はProcessor
    expect(kills.length).toBeGreaterThanOrEqual(2);
    expect(kills.every(k => k.type === 'component_removed' && k.componentType === 'Processor')).toBe(true);

    // 捕食者のStorage（初期エネルギー3000の方）に情報系素材（RX1の出力）が回収されている
    const predatorStorage = world.objects.find(
      (o): o is StorageComponent =>
        o.kind === 'component' &&
        o.componentType === 'Storage' &&
        (o.items.get(substanceCodeOf('EncodedFragment')) ?? 0) >= 2,
    );
    expect(predatorStorage).toBeDefined();
    expect(predatorStorage!.items.get(substanceCodeOf('InfoSeed'))).toBeGreaterThanOrEqual(1);

    // Processorの個体数は捕食開始時より減っている
    const processorsNow = world.objects.filter(
      o => o.kind === 'component' && o.componentType === 'Processor',
    ).length;
    expect(processorsNow).toBeLessThan(colonyProcessorsAtWake);

    // 原子保存は捕食を通じても維持される
    expect(formatAtomTotals(totalAtoms(world))).toBe(initialAtoms);
  });
});

/**
 * ゲームループ。フェーズ順は docs/specs/00_world_objects.md に従う:
 *   0. ノード帳票リセット → 1. Processor実行 → 2. アクション → 3. 自発変化
 *   → 4. 劣化 → 5. 物理 → 6. tick++
 */

import type { GameParams } from '../params';
import type { Rng } from '../rng';
import { executeActionPhase } from './actions';
import { executeDecayPhase, executeDurabilityPhase } from './lifecycle';
import { executePhysicsPhase } from './physics';
import { executeProcessorPhase } from './processor-io';
import type { SimulationEvent, World } from './types';
import { replaceObject } from './world';

export interface TickResult {
  readonly world: World;
  readonly events: readonly SimulationEvent[];
}

const resetNodeFlows = (world: World): World => {
  let w = world;
  for (const obj of world.objects) {
    if (obj.kind === 'energyNode' && obj.flowUsed !== 0) {
      w = replaceObject(w, { ...obj, flowUsed: 0 });
    }
  }
  return w;
};

export const executeTick = (world: World, params: GameParams, rng: Rng): TickResult => {
  const events: SimulationEvent[] = [];
  let w = resetNodeFlows(world);
  const { world: w1, executedIds } = executeProcessorPhase(w, params, events);
  w = executeActionPhase(w1, params, events);
  w = executeDecayPhase(w, params, rng, events);
  const { world: w2, activeActuatorIds } = prePhysicsActuators(w);
  w = executeDurabilityPhase(w2, params, executedIds, activeActuatorIds, events);
  w = executePhysicsPhase(w, params).world;
  return { world: { ...w, tick: w.tick + 1 }, events };
};

/**
 * 継続摩耗の判定用: このtickに「作動の意思がある」Actuator（magnitude>0）。
 * 実際の推進はフェーズ5で行われるが、摩耗判定は劣化フェーズ（4）で行うため先に収集する。
 */
const prePhysicsActuators = (world: World): { world: World; activeActuatorIds: ReadonlySet<number> } => {
  const ids = new Set<number>();
  for (const obj of world.objects) {
    if (obj.kind === 'component' && obj.componentType === 'Actuator' && obj.durability > 0) {
      if (obj.opmem[1] > 0) ids.add(obj.id);
    }
  }
  return { world, activeActuatorIds: ids };
};

export const runTicks = (
  world: World,
  params: GameParams,
  rng: Rng,
  ticks: number,
  onTick?: (result: TickResult) => void,
): World => {
  let w = world;
  for (let i = 0; i < ticks; i++) {
    const result = executeTick(w, params, rng);
    w = result.world;
    if (onTick !== undefined) onTick(result);
  }
  return w;
};

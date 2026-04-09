/**
 * Reflexes (M2) — automatic survival actions issued by the system layer.
 *
 * Reflexes are appended to a character's action reservation list AFTER VM
 * execution but BEFORE action execution. They fire only when the program
 * has not already issued a corresponding action this tick.
 *
 * Two reflexes are supported:
 *   - auto-recharge: when energy < threshold and an EnergyNode is in
 *     interactRange and Charger component is present
 *   - auto-repair:   when durability < threshold and Frame is in inventory
 *     and Assembler component is present
 *
 * Reflex reservations carry the same energy cost as ordinary reservations
 * (handled by the action engine). Reflexes are deterministic: they depend
 * only on the current world state.
 */

import type { Character, World } from './types.js';
import type { GameParams } from './params.js';
import type { ActionReservation } from './io.js';
import type { SpatialGrid } from './spatial-grid.js';
import { queryRange } from './spatial-grid.js';

const distance = (a: { x: number; y: number }, b: { x: number; y: number }): number => {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.sqrt(dx * dx + dy * dy);
};

const hasComponent = (character: Character, type: string): boolean =>
  character.components.includes(type as never);

export interface ReflexInjectionResult {
  readonly reservations: readonly ActionReservation[];
  readonly fired: boolean;
}

export interface ReflexEngine {
  injectReflexes(
    character: Character,
    world: World,
    reservations: readonly ActionReservation[],
    grid: SpatialGrid,
  ): ReflexInjectionResult;
}

export function createReflexEngine(params: GameParams): ReflexEngine {
  function injectReflexes(
    character: Character,
    world: World,
    reservations: readonly ActionReservation[],
    grid: SpatialGrid,
  ): ReflexInjectionResult {
    const result: ActionReservation[] = [...reservations];
    let fired = false;

    // --- auto-recharge ---
    if (
      character.energy < params.reflexEnergyThreshold &&
      hasComponent(character, 'Charger') &&
      !reservations.some((r) => r.op === 'RECHARGE')
    ) {
      // Find nearest EnergyNode within interactRange
      const nearby = queryRange(grid, character.position, params.interactRange);
      let bestId: string | null = null;
      let bestDist = Infinity;
      for (const entry of nearby) {
        if (entry.kind !== 'energyNode') continue;
        const d = distance(character.position, entry.position);
        if (d > params.interactRange) continue;
        if (d < bestDist) {
          bestDist = d;
          bestId = entry.id;
        }
      }
      if (bestId !== null) {
        // Use targetLocalId = 0 → "nearest" semantics in action executor.
        // The action executor will resolve nearest EnergyNode again, which
        // matches our intent.
        result.push({
          op: 'RECHARGE',
          slotIndex: 0,
          targetLocalId: 0,
        });
        fired = true;
      }
    }

    // --- auto-repair ---
    if (
      character.durability < params.reflexDurabilityThreshold &&
      hasComponent(character, 'Assembler') &&
      (character.inventory['Frame'] ?? 0) > 0 &&
      !reservations.some((r) => r.op === 'REPAIR')
    ) {
      result.push({
        op: 'REPAIR',
        slotIndex: 0,
      });
      fired = true;
    }

    return { reservations: result, fired };
  }

  return { injectReflexes };
}

import type { World, Program, ComponentType, Position } from './simulation/types.js';
import type { Engine } from './simulation/engine.js';
import type { Rng } from './simulation/world.js';
import { MIN_COMPONENTS } from './simulation/recipes.js';

// ============================================================
// Program definition for initial character placement
// ============================================================
export interface ProgramDef {
  name: string;
  components: ComponentType[];
  program: Program;
  count: number;
}

const INITIAL_ENERGY = 5000;

export function loadProgramJson(json: any): ProgramDef {
  const rules = json.rules.map((r: any) => ({
    condition: r.condition,
    action: r.action,
    ...(r.set_registers ? { set_registers: r.set_registers } : {}),
  }));
  const components: ComponentType[] = json.components ?? [...MIN_COMPONENTS];
  const name: string = json.name ?? 'Unknown';
  return {
    name,
    components,
    program: { name, rules },
    count: json.count ?? 3,
  };
}

// ============================================================
// Place initial characters into a world
// ============================================================
export function placeInitialCharacters(
  world: World,
  engine: Engine,
  programDefs: ProgramDef[],
  rng: Rng,
): World {
  let w = world;

  for (const def of programDefs) {
    for (let i = 0; i < def.count; i++) {
      const pos: Position = {
        x: 1 + rng() * (w.width - 2),
        y: 1 + rng() * (w.height - 2),
      };
      const id = `char-${String(w.nextCharacterId).padStart(3, '0')}`;
      w = { ...w, nextCharacterId: w.nextCharacterId + 1 };
      const character = engine.createCharacter(
        id, pos, [...def.components], def.program, INITIAL_ENERGY, def.name, 0,
      );
      w = { ...w, characters: [...w.characters, character] };
    }
  }

  return w;
}

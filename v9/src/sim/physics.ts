/**
 * 物理フェーズ（フェーズ5） — 推進・摩擦・衝突・積分。
 * v3の力学（Semi-implicit Euler, dt=1, バネ反発）を剛体=グループ/単独コンポーネントに適用する。
 * 仕様: docs/specs/01_physics.md
 */

import type { GameParams } from '../params';
import { componentMass } from './codes';
import { withOpmemPatch } from './components';
import { ACT_OFF_DIRECTION, ACT_OFF_MAGNITUDE, ACT_OFF_STATUS } from './opmem';
import { storedAtoms, withdrawEnergy } from './storage';
import type { ComponentObject, GroupObject, Position, World } from './types';
import { isWreck } from './types';
import { getComponent, getGroup, replaceObject } from './world';

interface RigidBody {
  readonly bodyId: number; // グループIDまたは単独コンポーネントID
  readonly isGroup: boolean;
  readonly memberIds: readonly number[];
  readonly position: Position;
  readonly velocity: Position;
  readonly mass: number;
  readonly radius: number;
}

const collectBodies = (world: World, params: GameParams): RigidBody[] => {
  const bodies: RigidBody[] = [];
  for (const obj of world.objects) {
    if (obj.kind === 'group') {
      bodies.push({
        bodyId: obj.id,
        isGroup: true,
        memberIds: obj.memberIds,
        position: obj.position,
        velocity: obj.velocity,
        mass: bodyMass(world, obj.memberIds, params),
        radius: params.componentRadius * Math.sqrt(obj.memberIds.length),
      });
    } else if (obj.kind === 'component' && obj.groupId === null) {
      bodies.push({
        bodyId: obj.id,
        isGroup: false,
        memberIds: [obj.id],
        position: obj.position,
        velocity: obj.velocity,
        mass: bodyMass(world, [obj.id], params),
        radius: params.componentRadius,
      });
    }
  }
  return bodies.sort((a, b) => a.bodyId - b.bodyId);
};

/** 質量 = メンバーの原子数 + Storage内容物の原子数（×massPerAtom） */
const bodyMass = (world: World, memberIds: readonly number[], params: GameParams): number => {
  let atoms = 0;
  for (const id of memberIds) {
    const component = getComponent(world, id);
    if (component === undefined) continue;
    atoms += componentMass(component);
    if (component.componentType === 'Storage') {
      atoms += storedAtoms(component);
    }
  }
  return Math.max(1, atoms * params.massPerAtom);
};

/** 推進力の適用。エネルギーを支払えたActuatorのみ力を発生する */
const applyThrust = (
  world: World,
  body: RigidBody,
  params: GameParams,
): { world: World; force: Position; activeActuatorIds: number[] } => {
  let w = world;
  let fx = 0;
  let fy = 0;
  const activeActuatorIds: number[] = [];
  for (const memberId of [...body.memberIds].sort((a, b) => a - b)) {
    const component = getComponent(w, memberId);
    if (component === undefined || component.componentType !== 'Actuator' || isWreck(component)) continue;
    const magnitude = Math.min(component.opmem[ACT_OFF_MAGNITUDE], params.thrustMax);
    if (magnitude <= 0) {
      if (component.opmem[ACT_OFF_STATUS] !== 0) {
        w = replaceObject(w, withOpmemPatch(component, [[ACT_OFF_STATUS, 0]]));
      }
      continue;
    }
    const cost = Math.ceil(magnitude / params.thrustEnergyDivisor);
    const { world: paidWorld, paid } = withdrawEnergy(w, memberId, cost);
    if (!paid) {
      w = replaceObject(w, withOpmemPatch(component, [[ACT_OFF_STATUS, 3]]));
      continue;
    }
    w = paidWorld;
    const angle = (component.opmem[ACT_OFF_DIRECTION] / 256) * 2 * Math.PI;
    fx += magnitude * params.thrustForceUnit * Math.cos(angle);
    fy += magnitude * params.thrustForceUnit * Math.sin(angle);
    activeActuatorIds.push(memberId);
    const current = getComponent(w, memberId);
    if (current !== undefined && current.opmem[ACT_OFF_STATUS] !== 1) {
      w = replaceObject(w, withOpmemPatch(current, [[ACT_OFF_STATUS, 1]]));
    }
  }
  return { world: w, force: { x: fx, y: fy }, activeActuatorIds };
};

/** バネ反発（v3と同一式）。Aに働く力を返す */
const collisionForce = (
  a: RigidBody,
  b: RigidBody,
  stiffness: number,
): Position | null => {
  const dx = b.position.x - a.position.x;
  const dy = b.position.y - a.position.y;
  const dist = Math.sqrt(dx * dx + dy * dy);
  const overlap = a.radius + b.radius - dist;
  if (overlap <= 0) return null;
  if (dist < 0.001) return { x: -overlap * stiffness, y: 0 };
  const magnitude = overlap * stiffness;
  return { x: (-dx / dist) * magnitude, y: (-dy / dist) * magnitude };
};

const wallForce = (body: RigidBody, world: World, stiffness: number): Position => {
  let fx = 0;
  let fy = 0;
  const { x, y } = body.position;
  const r = body.radius;
  if (x < r) fx += (r - x) * stiffness;
  if (x > world.width - r) fx -= (x - (world.width - r)) * stiffness;
  if (y < r) fy += (r - y) * stiffness;
  if (y > world.height - r) fy -= (y - (world.height - r)) * stiffness;
  return { x: fx, y: fy };
};

export const executePhysicsPhase = (
  world: World,
  params: GameParams,
): { world: World; activeActuatorIds: ReadonlySet<number> } => {
  let w = world;
  const bodies = collectBodies(w, params);
  const forces = new Map<number, Position>(bodies.map(b => [b.bodyId, { x: 0, y: 0 }]));
  const activeActuators = new Set<number>();

  // 推進
  for (const body of bodies) {
    const { world: w1, force, activeActuatorIds } = applyThrust(w, body, params);
    w = w1;
    const current = forces.get(body.bodyId)!;
    forces.set(body.bodyId, { x: current.x + force.x, y: current.y + force.y });
    for (const id of activeActuatorIds) activeActuators.add(id);
  }

  // 摩擦
  for (const body of bodies) {
    const current = forces.get(body.bodyId)!;
    forces.set(body.bodyId, {
      x: current.x - body.velocity.x * params.frictionCoefficient * body.mass,
      y: current.y - body.velocity.y * params.frictionCoefficient * body.mass,
    });
  }

  // 衝突（ペア二重計上なし・作用反作用）と壁
  for (let i = 0; i < bodies.length; i++) {
    for (let j = i + 1; j < bodies.length; j++) {
      const force = collisionForce(bodies[i], bodies[j], params.collisionStiffness);
      if (force === null) continue;
      const fa = forces.get(bodies[i].bodyId)!;
      forces.set(bodies[i].bodyId, { x: fa.x + force.x, y: fa.y + force.y });
      const fb = forces.get(bodies[j].bodyId)!;
      forces.set(bodies[j].bodyId, { x: fb.x - force.x, y: fb.y - force.y });
    }
    const wf = wallForce(bodies[i], w, params.collisionStiffness);
    const f = forces.get(bodies[i].bodyId)!;
    forces.set(bodies[i].bodyId, { x: f.x + wf.x, y: f.y + wf.y });
  }

  // 積分（Semi-implicit Euler, dt=1。速度クランプは位置更新の前）
  for (const body of bodies) {
    const force = forces.get(body.bodyId)!;
    const ax = force.x / body.mass;
    const ay = force.y / body.mass;
    let vx = body.velocity.x + ax;
    let vy = body.velocity.y + ay;
    // 媒質の終端速度。軽い剛体が重なり反発で射出されるのを防ぐ
    const speed = Math.sqrt(vx * vx + vy * vy);
    if (speed > params.maxSpeed) {
      vx = (vx / speed) * params.maxSpeed;
      vy = (vy / speed) * params.maxSpeed;
    }
    if (vx * vx + vy * vy < params.velocityClampThreshold * params.velocityClampThreshold) {
      vx = 0;
      vy = 0;
    }
    const px = Math.min(Math.max(body.position.x + vx, body.radius), w.width - body.radius);
    const py = Math.min(Math.max(body.position.y + vy, body.radius), w.height - body.radius);

    if (body.isGroup) {
      const group = getGroup(w, body.bodyId);
      if (group !== undefined) {
        const updated: GroupObject = { ...group, position: { x: px, y: py }, velocity: { x: vx, y: vy } };
        w = replaceObject(w, updated);
      }
    } else {
      const component = getComponent(w, body.bodyId);
      if (component !== undefined) {
        const updated: ComponentObject = {
          ...component,
          position: { x: px, y: py },
          velocity: { x: vx, y: vy },
        };
        w = replaceObject(w, updated);
      }
    }
  }

  return { world: w, activeActuatorIds: activeActuators };
};

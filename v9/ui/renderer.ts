/**
 * Canvas 2D レンダラ。v9のWorldを2Dで描画し、パン/ズーム/クリック選択を提供する。
 * 依存を増やさないため素のCanvas 2Dを使う（v8はpixi.jsだったがv9は不要な範囲）。
 *
 * ## 視覚言語（docs/specs/08_ui.md）
 * 符号化の定義は `visual-language-model.js`（`window.V9Visual`）**1か所だけ**が持つ。
 * 視覚言語ダッシュボード（visual-language.html）と本UIは同じ定義を読むので、
 * 片方を直せば両方が変わる。ここが持つのは「v9のオブジェクトを表示クラスへ写す」対応と、
 * 「v9の数値（残量・部品数など）を量の基準で割って半径に変える」換算だけである。
 *
 * 色は1つも書かない。すべてキットの処方から導出したトークンで来る。
 */

import { substanceByCode } from '@/sim/codes.js';
import { DEFAULT_GAME_PARAMS } from '@/params.js';
import type { ComponentObject, ProcessorComponent, World, WorldObject } from '@/sim/types.js';
import { isWreck } from '@/sim/types.js';
import type { SimUIMark, SimUIMarkState, SimUIShape, V9Palettes } from './sim-ui-kit.js';

export type Selection = { id: number } | null;

const Visual = window.V9Visual;
const Shapes = window.SimUIShapes;
const StateMarks = window.SimUIStateMarks;

/** 耐久リングの正規化基準。全実験で共通のためデフォルトを参照する（表示のみ） */
const MAX_DURABILITY = DEFAULT_GAME_PARAMS.maxDurability;
/** 湧出点の残流量の正規化基準 */
const MAX_NODE_FLOW = DEFAULT_GAME_PARAMS.energyNodeFlow;

/**
 * 量の基準。**この値のとき半径が基準サイズになる**。
 * v9 の実数値（残量400・部品数4…）を、視覚言語が期待する 1 前後の量へ揃えるための換算。
 */
const AMOUNT_REFERENCE: Readonly<Record<string, number>> = {
  matter: 100,
  organism: 4,
  component: 1,
  energy: 0.5,
};
/** 散布エネルギーの量の基準（Storage残骸の分解で出るため単位が大きい） */
const ENERGY_PILE_REFERENCE = 200;
/** クリックの許容半径（ワールド単位）。画面のズームぶんを足して使う */
const CLICK_SLACK = 1.5;

/** 物質カテゴリ → 表示クラス。component カテゴリの物質は素材として扱う */
const CLASS_BY_CATEGORY: Readonly<Record<string, string>> = {
  structure: 'structure',
  waste: 'waste',
  active: 'active',
  transfer: 'transfer',
  information: 'information',
  catalyst: 'catalyst',
  component: 'structure',
};

/** コンポーネント種 → 表示クラス。色の予算が4なので、種を決めない4種は畳む */
const CLASS_BY_COMPONENT: Readonly<Record<string, string>> = {
  Harvester: 'harvester',
  Actuator: 'actuator',
  Disassembler: 'disassembler',
  Assembler: 'assembler',
};

/** 個体（グループ）の「種」を構成から推定する */
const speciesClass = (members: readonly ComponentObject[]): string => {
  const types = new Set(members.map(m => m.componentType));
  if (types.has('Disassembler')) return 'predator';
  if (types.has('Actuator')) return 'mover';
  return 'settler';
};

const classOfMatter = (substanceCode: number): string => {
  const category = substanceByCode(substanceCode)?.category ?? 'structure';
  return CLASS_BY_CATEGORY[category] ?? 'structure';
};

interface View {
  scale: number;
  offsetX: number;
  offsetY: number;
}

/** 描画に必要な、1オブジェクトぶんの視覚言語上の姿 */
interface Appearance {
  classId: string;
  kindId: string;
  amount: number;
  state: SimUIMarkState;
  level: number | null;
}

/** 処方から2組のパレットと予約色を作る。処方が動かない限り一度きり */
const buildPalettes = (): V9Palettes => {
  const { recipe, tuning } = Visual.DEFAULTS;
  const organism = window.SimUIRecipes.derive('v9-organism', recipe);
  const environment = window.SimUIRecipes.derive('v9-environment', { ...recipe, chromaScale: tuning.environmentChroma });
  const energy = Visual.energyColor(tuning);
  return {
    organism,
    environment,
    energy,
    energyBackdrop: Visual.backdropColor(energy, organism.surface.base, tuning.energyBackdrop),
    grey: Visual.greyColor(tuning.structureLightness),
    greyDim: Visual.greyColor(tuning.wasteLightness),
    surface: organism.surface,
  };
};

const PALETTES = buildPalettes();
const SHAPES = Visual.shapeCatalog(Visual.DEFAULTS.tuning.corner);

/** 表示クラスの色。凡例とメトリクスも同じ色をここから取る */
export const classColor = (classId: string): string =>
  Visual.colorOf(PALETTES, Visual.DEFAULTS.slots[classId], Visual.classById(classId).kind);

export const surfaceTokens = PALETTES.surface;
export const encodingTable = Visual.ENCODING;
export const stateChannels = Visual.STATE_CHANNELS;
export const visualKinds = Visual.KINDS;
export const visualClasses = Visual.CLASSES;

export class Renderer {
  private canvas!: HTMLCanvasElement;
  private ctx!: CanvasRenderingContext2D;
  private view: View = { scale: 6, offsetX: 0, offsetY: 0 };
  private world: World | null = null;
  private currentSelection: Selection = null;
  private onSelect: (sel: Selection) => void = () => {};

  init(container: HTMLElement): void {
    this.canvas = document.createElement('canvas');
    this.canvas.style.display = 'block';
    this.canvas.style.cursor = 'grab';
    container.appendChild(this.canvas);
    const ctx = this.canvas.getContext('2d');
    if (ctx === null) throw new Error('canvas 2d context を取得できない');
    this.ctx = ctx;
    this.resize();
    this.setupInteraction();
    window.addEventListener('resize', () => {
      this.resize();
      this.redraw();
    });
  }

  private resize(): void {
    const rect = this.canvas.parentElement!.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    this.canvas.width = Math.max(1, Math.floor(rect.width * dpr));
    this.canvas.height = Math.max(1, Math.floor(rect.height * dpr));
    this.canvas.style.width = `${rect.width}px`;
    this.canvas.style.height = `${rect.height}px`;
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  resetView(worldWidth: number, worldHeight: number): void {
    const rect = this.canvas.getBoundingClientRect();
    const scale = Math.min(rect.width / worldWidth, rect.height / worldHeight) * 0.92;
    this.view = {
      scale,
      offsetX: (rect.width - worldWidth * scale) / 2,
      offsetY: (rect.height - worldHeight * scale) / 2,
    };
  }

  onSelectChanged(cb: (sel: Selection) => void): void {
    this.onSelect = cb;
  }

  setSelection(sel: Selection): void {
    this.currentSelection = sel;
  }

  private toScreen(x: number, y: number): [number, number] {
    return [x * this.view.scale + this.view.offsetX, y * this.view.scale + this.view.offsetY];
  }

  private toWorld(sx: number, sy: number): [number, number] {
    return [(sx - this.view.offsetX) / this.view.scale, (sy - this.view.offsetY) / this.view.scale];
  }

  private setupInteraction(): void {
    let dragging = false;
    let dragged = false;
    let lastX = 0;
    let lastY = 0;
    this.canvas.addEventListener('mousedown', e => {
      dragging = true;
      dragged = false;
      lastX = e.offsetX;
      lastY = e.offsetY;
      this.canvas.style.cursor = 'grabbing';
    });
    window.addEventListener('mouseup', e => {
      if (dragging && !dragged) this.handleClick(e.offsetX, e.offsetY);
      dragging = false;
      this.canvas.style.cursor = 'grab';
    });
    this.canvas.addEventListener('mousemove', e => {
      if (!dragging) return;
      const dx = e.offsetX - lastX;
      const dy = e.offsetY - lastY;
      if (Math.abs(dx) + Math.abs(dy) > 3) dragged = true;
      this.view.offsetX += dx;
      this.view.offsetY += dy;
      lastX = e.offsetX;
      lastY = e.offsetY;
      this.redraw();
    });
    this.canvas.addEventListener('wheel', e => {
      e.preventDefault();
      const factor = e.deltaY < 0 ? 1.15 : 1 / 1.15;
      const [wx, wy] = this.toWorld(e.offsetX, e.offsetY);
      this.view.scale *= factor;
      // カーソル位置を中心にズーム
      this.view.offsetX = e.offsetX - wx * this.view.scale;
      this.view.offsetY = e.offsetY - wy * this.view.scale;
      this.redraw();
    }, { passive: false });
  }

  private handleClick(sx: number, sy: number): void {
    if (this.world === null) return;
    const [wx, wy] = this.toWorld(sx, sy);
    let best: WorldObject | null = null;
    let bestDist = Infinity;
    for (const obj of this.world.objects) {
      if (obj.kind === 'component' && obj.groupId !== null) continue; // グループ経由で選ぶ
      const d = Math.hypot(obj.position.x - wx, obj.position.y - wy);
      if (d < bestDist) {
        bestDist = d;
        best = obj;
      }
    }
    this.onSelect(best !== null && bestDist <= 4 / this.view.scale + CLICK_SLACK ? { id: best.id } : null);
  }

  // === 視覚言語への写像 ===

  /** v9 のオブジェクト1つを、表示クラス・量・状態へ写す */
  private appearanceOf(obj: WorldObject, selected: boolean): Appearance | null {
    if (obj.kind === 'matterNode') {
      return { classId: classOfMatter(obj.substanceCode), kindId: 'matter', amount: obj.remaining, state: { outline: selected }, level: null };
    }
    if (obj.kind === 'ground') {
      return { classId: classOfMatter(obj.substanceCode), kindId: 'matter', amount: obj.count, state: { outline: selected }, level: null };
    }
    if (obj.kind === 'energyNode') {
      // 量を持たないので大きさは固定。当tickの残流量だけが状態
      const level = Math.max(0, MAX_NODE_FLOW - obj.flowUsed) / MAX_NODE_FLOW;
      return { classId: 'energyNode', kindId: 'energy', amount: 1, state: { outline: selected }, level };
    }
    if (obj.kind === 'energyPile') {
      return { classId: 'energyPile', kindId: 'energy', amount: obj.amount / ENERGY_PILE_REFERENCE, state: { outline: selected }, level: null };
    }
    if (obj.kind === 'group') {
      const members = obj.memberIds
        .map(id => this.world!.objects.find(o => o.id === id))
        .filter((m): m is ComponentObject => m !== undefined && m.kind === 'component');
      const alive = members.filter(m => !isWreck(m));
      const durability = alive.length === 0
        ? 0
        : alive.reduce((sum, m) => sum + m.durability, 0) / alive.length / MAX_DURABILITY;
      const running = alive.filter(m => m.componentType === 'Processor' && (m as ProcessorComponent).running).length;
      return {
        classId: alive.length === 0 ? 'settler' : speciesClass(alive),
        kindId: 'organism',
        amount: obj.memberIds.length,
        state: { ring: durability, pips: running, outline: selected },
        level: null,
      };
    }
    if (obj.kind === 'component' && obj.groupId === null) {
      return {
        classId: CLASS_BY_COMPONENT[obj.componentType] ?? 'otherPart',
        kindId: 'component',
        amount: 1,
        state: { fill: obj.durability / MAX_DURABILITY, outline: selected },
        level: null,
      };
    }
    return null;
  }

  private markOf(obj: WorldObject, look: Appearance): SimUIMark {
    const kind = Visual.kindById(look.kindId);
    const shape = SHAPES.find((s: SimUIShape) => s.id === Visual.DEFAULTS.shapes[look.kindId])!;
    const [sx, sy] = this.toScreen(obj.position.x, obj.position.y);
    const radius = Visual.radiusOf(look.amount / AMOUNT_REFERENCE[look.kindId], Visual.DEFAULTS.areas[look.kindId]);
    return {
      shape,
      x: sx,
      y: sy,
      radius: Math.max(kind.minPx, radius * this.view.scale),
      color: classColor(look.classId),
      ink: PALETTES.surface.ink,
      surface: PALETTES.surface.base,
    };
  }

  /**
   * エネルギー湧出点。**量を持たないので大きさでは何も運べない。**
   * 固定サイズの薄い下敷きの上へ、当tickの残流量ぶんの**面積**で黄を重ねる。
   * 満量なら下敷きが隠れて、ふつうの黄の四角に見える。
   */
  private drawEnergyNode(mark: SimUIMark, level: number, selected: boolean): void {
    this.ctx.fillStyle = PALETTES.energyBackdrop;
    Shapes.path(this.ctx, mark.shape, mark.x, mark.y, mark.radius);
    this.ctx.fill();
    const ratio = Math.max(0, Math.min(1, level));
    if (ratio > 0) {
      this.ctx.fillStyle = mark.color;
      // 面積を比に合わせるので、半径は平方根で縮める
      Shapes.path(this.ctx, mark.shape, mark.x, mark.y, mark.radius * Math.sqrt(ratio));
      this.ctx.fill();
    }
    StateMarks.outline(this.ctx, mark, selected);
  }

  // === 描画 ===

  draw(world: World, selection: Selection): void {
    this.world = world;
    this.currentSelection = selection;
    const ctx = this.ctx;
    const rect = this.canvas.getBoundingClientRect();
    ctx.fillStyle = PALETTES.surface.base;
    ctx.fillRect(0, 0, rect.width, rect.height);

    // 壁（ワールド境界）
    const [x0, y0] = this.toScreen(0, 0);
    const [x1, y1] = this.toScreen(world.width, world.height);
    ctx.strokeStyle = PALETTES.surface.line;
    ctx.lineWidth = 1;
    ctx.strokeRect(x0, y0, x1 - x0, y1 - y0);

    // 個体を最後に描いて前景へ置く（重なったときに主体が隠れない）
    const background = world.objects.filter(o => o.kind !== 'group');
    for (const obj of background) this.drawObject(obj, selection);
    for (const obj of world.objects) {
      if (obj.kind === 'group') this.drawObject(obj, selection);
    }
  }

  private drawObject(obj: WorldObject, selection: Selection): void {
    const selected = selection?.id === obj.id;
    const look = this.appearanceOf(obj, selected);
    if (look === null) return;
    const mark = this.markOf(obj, look);
    if (look.level !== null) {
      this.drawEnergyNode(mark, look.level, selected);
      return;
    }
    StateMarks.draw(this.ctx, mark, look.state);
  }

  private redraw(): void {
    if (this.world !== null) this.draw(this.world, this.currentSelection);
  }
}

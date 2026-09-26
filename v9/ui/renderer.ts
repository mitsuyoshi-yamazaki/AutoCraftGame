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
import type { GameParams } from '@/params.js';
import type { ComponentObject, ProcessorComponent, World, WorldObject } from '@/sim/types.js';
import { isWreck } from '@/sim/types.js';
import type { SimUIMark, SimUIMarkState, SimUIShape, V9Palettes } from './sim-ui-kit.js';

export type Selection = { id: number } | null;

/**
 * 字幕が指している場所の印。**対象が消えたあとも座標に残す**ので、
 * 崩壊のように「消えること自体が出来事」でも、どこで起きたかが分かる。
 */
export type Highlight = { x: number; y: number } | null;

const Visual = window.V9Visual;
const Shapes = window.SimUIShapes;
const StateMarks = window.SimUIStateMarks;

/**
 * 量の基準。**この値のとき半径が基準サイズになる**。
 * v9 の実数値を、視覚言語が期待する 1 前後の量へ揃えるための換算。
 *
 * 物質だけは実験ごとに 100 倍も違う（既定 400／移動複製 4000／潤沢 40000）ので、
 * **固定値にできない**。abundant なノードの初期量を基準に取り、
 * 「満量の abundant ノード＝つねに同じ大きさ」になるようにする。
 */
const ORGANISM_REFERENCE = 4;
const COMPONENT_REFERENCE = 1;
const ENERGY_NODE_REFERENCE = 0.5;
/** 字幕の指す場所に置く印の大きさ（px）。拡大率に依らず一定にして見失わないようにする */
export const HIGHLIGHT_RADIUS_PX = 16;
const HIGHLIGHT_CROSS_PX = 6;
/** 面と面の間に置く地の色の隙間（px）。規約 B-4 */
const GAP_PX = 1;
/** 角丸が辺を食う長さ（px）。マークの大きさに依らず一定にする */
const CORNER_PX = Visual.DEFAULTS.tuning.cornerPx;
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
const SHAPES = Visual.shapeCatalog();

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
  private params: GameParams = DEFAULT_GAME_PARAMS;
  private currentSelection: Selection = null;
  private highlight: Highlight | null = null;
  private onSelect: (sel: Selection) => void = () => {};
  private onView: () => void = () => {};

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

  /** パン・ズームで見え方が変わったときに呼ぶ（字幕は画面座標で置くので追従が要る） */
  onViewChanged(cb: () => void): void {
    this.onView = cb;
  }

  /** ワールド座標を画面座標（CSSピクセル・canvasの左上基準）へ */
  screenPositionOf(x: number, y: number): { x: number; y: number } {
    const [sx, sy] = this.toScreen(x, y);
    return { x: sx, y: sy };
  }

  setSelection(sel: Selection): void {
    this.currentSelection = sel;
  }

  setHighlight(highlight: Highlight): void {
    this.highlight = highlight;
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
      const level = Math.max(0, this.params.energyNodeFlow - obj.flowUsed) / this.params.energyNodeFlow;
      return { classId: 'energyNode', kindId: 'energy', amount: 1, state: { outline: selected }, level };
    }
    if (obj.kind === 'energyPile') {
      // 散布エネルギーは Storage 残骸の分解で出るので、容量を量の基準に取る
      return { classId: 'energyPile', kindId: 'energy', amount: obj.amount / this.params.energyCapacity, state: { outline: selected }, level: null };
    }
    if (obj.kind === 'group') {
      const members = obj.memberIds
        .map(id => this.world!.objects.find(o => o.id === id))
        .filter((m): m is ComponentObject => m !== undefined && m.kind === 'component');
      const alive = members.filter(m => !isWreck(m));
      const durability = alive.length === 0
        ? 0
        : alive.reduce((sum, m) => sum + m.durability, 0) / alive.length / this.params.maxDurability;
      const running = alive.filter(m => m.componentType === 'Processor' && (m as ProcessorComponent).running).length;
      return {
        // 生存部品が無いものは種ではない。専用クラスへ落とす（旧実装の灰と同じ扱い）
        classId: alive.length === 0 ? 'wreck' : speciesClass(alive),
        kindId: 'organism',
        amount: obj.memberIds.length,
        state: { ring: durability, pips: running, outline: selected },
        level: null,
      };
    }
    if (obj.kind === 'component' && obj.groupId === null) {
      return {
        classId: isWreck(obj) ? 'wreckPart' : (CLASS_BY_COMPONENT[obj.componentType] ?? 'otherPart'),
        kindId: 'component',
        amount: 1,
        state: { fill: obj.durability / this.params.maxDurability, outline: selected },
        level: null,
      };
    }
    return null;
  }

  /** 大分類ごとの量の基準。物質だけは実験のパラメータから取る */
  private referenceOf(kindId: string): number {
    if (kindId === 'matter') return this.params.nodeAmountByAbundance.abundant;
    if (kindId === 'organism') return ORGANISM_REFERENCE;
    if (kindId === 'component') return COMPONENT_REFERENCE;
    return ENERGY_NODE_REFERENCE;
  }

  private markOf(obj: WorldObject, look: Appearance): SimUIMark {
    const kind = Visual.kindById(look.kindId);
    const [sx, sy] = this.toScreen(obj.position.x, obj.position.y);
    const worldRadius = Visual.radiusOf(look.amount / this.referenceOf(look.kindId), Visual.DEFAULTS.areas[look.kindId]);
    const radius = Math.max(kind.minPx, worldRadius * this.view.scale);
    const base = SHAPES.find((s: SimUIShape) => s.id === Visual.DEFAULTS.shapes[look.kindId])!;
    return {
      // 角丸はマークの大きさに依らず一定の px にするので、ここで輪郭を決める
      shape: Visual.shapeAt(base, CORNER_PX, radius),
      x: sx,
      y: sy,
      radius,
      color: classColor(look.classId),
      ink: PALETTES.surface.ink,
      surface: PALETTES.surface.base,
    };
  }

  /** 隣り合う面の間に地の色の隙間を置く（規約 B-4） */
  private carveGap(mark: SimUIMark): void {
    this.ctx.lineWidth = GAP_PX * 2;
    this.ctx.strokeStyle = mark.surface;
    Shapes.path(this.ctx, mark.shape, mark.x, mark.y, mark.radius);
    this.ctx.stroke();
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

  draw(world: World, selection: Selection, params: GameParams): void {
    this.world = world;
    this.params = params;
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
    this.drawHighlight();
  }

  /** 字幕の指す場所に印を描く。色は地の ink だけを使う（新しい色を作らない） */
  private drawHighlight(): void {
    if (this.highlight === null) return;
    const { x, y } = this.highlight;
    const [sx, sy] = this.toScreen(x, y);
    const ctx = this.ctx;
    ctx.save();
    ctx.strokeStyle = PALETTES.surface.ink;
    ctx.globalAlpha = 0.9;
    ctx.lineWidth = 2;
    ctx.setLineDash([6, 4]);
    ctx.beginPath();
    ctx.arc(sx, sy, HIGHLIGHT_RADIUS_PX, 0, Math.PI * 2);
    ctx.stroke();
    // 十字（対象が消えても位置が読める）
    ctx.setLineDash([]);
    ctx.globalAlpha = 0.7;
    ctx.beginPath();
    ctx.moveTo(sx - HIGHLIGHT_CROSS_PX, sy);
    ctx.lineTo(sx + HIGHLIGHT_CROSS_PX, sy);
    ctx.moveTo(sx, sy - HIGHLIGHT_CROSS_PX);
    ctx.lineTo(sx, sy + HIGHLIGHT_CROSS_PX);
    ctx.stroke();
    ctx.restore();
  }

  private drawObject(obj: WorldObject, selection: Selection): void {
    const selected = selection?.id === obj.id;
    const look = this.appearanceOf(obj, selected);
    if (look === null) return;
    const mark = this.markOf(obj, look);
    this.carveGap(mark);
    if (look.level !== null) {
      this.drawEnergyNode(mark, look.level, selected);
      return;
    }
    StateMarks.draw(this.ctx, mark, look.state);
  }

  private redraw(): void {
    if (this.world !== null) this.draw(this.world, this.currentSelection, this.params);
    this.onView();
  }
}

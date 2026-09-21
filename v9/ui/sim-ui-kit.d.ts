/**
 * simulation-ui-kit と視覚言語の定義（visual-language-model.js）の型。
 *
 * どちらも素のスクリプトで、`file://` でも開けるよう ES module にしていない。
 * index.html が `<script>` で先に読み込むので、ここでは window 上の形だけを宣言する。
 * キットは `.d.ts` を同梱していないため、**使う範囲だけ**を自分で書いている。
 */

export interface SimUISurface {
  readonly base: string;
  readonly panel: string;
  readonly line: string;
  readonly ink: string;
  readonly inkDim: string;
}

export interface SimUIPalette {
  readonly id: string;
  readonly surface: SimUISurface;
  readonly categorical: readonly string[];
  readonly sequential: readonly string[];
  readonly status: { readonly good: string; readonly warn: string; readonly bad: string };
}

export interface SimUIRecipe {
  readonly label: string;
  readonly note: string;
  readonly surface: string;
  readonly categorical: string;
  readonly sequentialPerceptual: string;
  readonly diverging: string;
  readonly chromaScale: number;
}

export interface SimUIShape {
  readonly id: string;
  readonly label: string;
}

/** 1つのマークが持つ情報。identity（形・色）と場所・大きさだけで、状態は含まない */
export interface SimUIMark {
  readonly shape: SimUIShape;
  readonly x: number;
  readonly y: number;
  readonly radius: number;
  readonly color: string;
  readonly ink: string;
  readonly surface: string;
}

/** 状態チャネル。identity が使っていないチャネルにだけ載せる（規約 A-6） */
export interface SimUIMarkState {
  readonly ring?: number;
  readonly fill?: number;
  readonly pips?: number;
  readonly outline?: boolean;
  readonly halo?: number;
}

export interface V9Tuning {
  readonly environmentChroma: number;
  readonly energyHue: number;
  readonly energyChroma: number;
  readonly energyLightness: number;
  readonly energyBackdrop: number;
  readonly structureLightness: number;
  readonly wasteLightness: number;
  readonly corner: number;
}

export interface V9Kind {
  readonly id: string;
  readonly label: string;
  readonly shape: string;
  readonly area: number;
  readonly minPx: number;
  readonly palette: 'organism' | 'environment';
  readonly note?: string;
}

export interface V9Class {
  readonly id: string;
  readonly kind: string;
  readonly label: string;
  readonly slot: string;
  readonly note?: string;
}

export interface V9Palettes {
  readonly organism: SimUIPalette;
  readonly environment: SimUIPalette;
  readonly energy: string;
  readonly energyBackdrop: string;
  readonly grey: string;
  readonly greyDim: string;
  readonly surface: SimUISurface;
}

declare global {
  interface Window {
    SimUIColor: {
      mix(a: string, b: string, t: number): string;
      lchToHex(lch: readonly [number, number, number]): string;
      maxChroma(lightness: number, hue: number): number;
      deltaE(a: string, b: string): number;
    };
    SimUIShapes: {
      path(ctx: CanvasRenderingContext2D, shape: SimUIShape, x: number, y: number, radius: number): void;
    };
    SimUIStateMarks: {
      draw(ctx: CanvasRenderingContext2D, mark: SimUIMark, state: SimUIMarkState): void;
      outline(ctx: CanvasRenderingContext2D, mark: SimUIMark, on: boolean): void;
    };
    SimUIRecipes: {
      derive(name: string, recipe?: SimUIRecipe): SimUIPalette;
    };
    V9Visual: {
      readonly KINDS: readonly V9Kind[];
      readonly CLASSES: readonly V9Class[];
      readonly ENCODING: readonly { channel: string; carries: string }[];
      readonly STATE_CHANNELS: readonly { label: string; carries: string }[];
      readonly DEFAULTS: {
        readonly recipe: SimUIRecipe;
        readonly tuning: V9Tuning;
        readonly shapes: Readonly<Record<string, string>>;
        readonly areas: Readonly<Record<string, number>>;
        readonly slots: Readonly<Record<string, string>>;
      };
      kindById(id: string): V9Kind;
      classById(id: string): V9Class;
      shapeCatalog(corner: number): readonly SimUIShape[];
      energyColor(tuning: V9Tuning): string;
      greyColor(lightness: number): string;
      backdropColor(energy: string, surfaceBase: string, amount: number): string;
      colorOf(palettes: V9Palettes, slotId: string, kindId: string): string;
      radiusOf(amount: number, areaCoefficient: number): number;
    };
  }
}

export {};

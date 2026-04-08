/**
 * バージョン更新ルール:
 * GAME_VERSION と package.json の version を同時に更新すること。
 *
 * - メジャー: アプリケーションを作り直した際に上げる (v1/v2/v3/v4/v5)
 * - マイナー: ゲーム仕様の変更により、同一初期状態からの実行結果が変わった場合に上げる
 * - パッチ: ゲーム本体の実装が変更された場合に上げる
 */

export class SemanticVersion {
  constructor(
    readonly major: number,
    readonly minor: number,
    readonly patch: number,
  ) {}

  toString(): string {
    return `${this.major}.${this.minor}.${this.patch}`;
  }
}

export const GAME_VERSION = new SemanticVersion(5, 0, 0);

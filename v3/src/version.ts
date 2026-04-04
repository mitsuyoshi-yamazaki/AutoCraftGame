/**
 * バージョン更新ルール:
 * GAME_VERSION と package.json の version を同時に更新すること。
 *
 * - メジャー: アプリケーションを作り直した際に上げる (v1/v2/v3)
 * - マイナー: ゲーム仕様の変更により、同一初期状態からの実行結果が変わった場合に上げる
 * - パッチ: ゲーム本体の実装が変更された場合に上げる
 */

export class SemanticVersion {
  readonly major: number;
  readonly minor: number;
  readonly patch: number;

  constructor(major: number, minor: number, patch: number) {
    this.major = major;
    this.minor = minor;
    this.patch = patch;
  }

  compareMajor(other: SemanticVersion): number {
    return Math.sign(this.major - other.major);
  }

  compareMinor(other: SemanticVersion): number {
    return Math.sign(this.minor - other.minor);
  }

  comparePatch(other: SemanticVersion): number {
    return Math.sign(this.patch - other.patch);
  }

  compare(other: SemanticVersion): number {
    const majorDiff = this.compareMajor(other);
    if (majorDiff !== 0) return majorDiff;
    const minorDiff = this.compareMinor(other);
    if (minorDiff !== 0) return minorDiff;
    return this.comparePatch(other);
  }

  toString(): string {
    return `${this.major}.${this.minor}.${this.patch}`;
  }
}

export const GAME_VERSION = new SemanticVersion(3, 11, 0);

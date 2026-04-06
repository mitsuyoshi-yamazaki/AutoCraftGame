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

export const GAME_VERSION = new SemanticVersion(4, 0, 0);

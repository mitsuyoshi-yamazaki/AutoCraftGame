import { describe, it, expect } from 'vitest';
import { SemanticVersion, GAME_VERSION } from '../src/version.js';

describe('SemanticVersion', () => {
  describe('compare', () => {
    it('returns 0 for equal versions', () => {
      const a = new SemanticVersion(1, 2, 3);
      const b = new SemanticVersion(1, 2, 3);
      expect(a.compare(b)).toBe(0);
    });

    it('compares by major first', () => {
      const a = new SemanticVersion(2, 0, 0);
      const b = new SemanticVersion(1, 9, 9);
      expect(a.compare(b)).toBe(1);
      expect(b.compare(a)).toBe(-1);
    });

    it('compares by minor when major is equal', () => {
      const a = new SemanticVersion(1, 3, 0);
      const b = new SemanticVersion(1, 2, 9);
      expect(a.compare(b)).toBe(1);
      expect(b.compare(a)).toBe(-1);
    });

    it('compares by patch when major and minor are equal', () => {
      const a = new SemanticVersion(1, 2, 4);
      const b = new SemanticVersion(1, 2, 3);
      expect(a.compare(b)).toBe(1);
      expect(b.compare(a)).toBe(-1);
    });
  });

  describe('compareMajor / compareMinor / comparePatch', () => {
    it('compareMajor compares only major', () => {
      const a = new SemanticVersion(3, 0, 0);
      const b = new SemanticVersion(2, 5, 5);
      expect(a.compareMajor(b)).toBe(1);
    });

    it('compareMinor compares only minor', () => {
      const a = new SemanticVersion(1, 5, 0);
      const b = new SemanticVersion(1, 3, 9);
      expect(a.compareMinor(b)).toBe(1);
    });

    it('comparePatch compares only patch', () => {
      const a = new SemanticVersion(1, 2, 5);
      const b = new SemanticVersion(1, 2, 3);
      expect(a.comparePatch(b)).toBe(1);
    });
  });

  describe('toString', () => {
    it('formats as major.minor.patch', () => {
      expect(new SemanticVersion(3, 10, 0).toString()).toBe('3.10.0');
    });
  });

  describe('GAME_VERSION', () => {
    it('is 3.13.0', () => {
      expect(GAME_VERSION.toString()).toBe('3.13.0');
    });
  });
});

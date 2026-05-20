import { describe, it, expect } from '@jest/globals';
import follows from '../../../src/config/follows';

describe('config/follows', () => {
  it('should export default config', () => {
    expect(follows).toBeDefined();
  });

  it('should have binance exchange', () => {
    expect(follows.binance).toBeDefined();
    expect(follows.binance.enabled).toBe(true);
  });

  it('should have reportedSymbols array', () => {
    expect(Array.isArray(follows.binance.reportedSymbols)).toBe(true);
    expect(follows.binance.reportedSymbols.length).toBeGreaterThan(0);
  });
});

import { describe, it, expect } from '@jest/globals';

import { deterministicStringify } from '../../src/utils/deterministic-stringify';

describe('deterministicStringify', () => {
  it('should produce same output for same logical object regardless of key order', () => {
    const a = { b: 2, a: 1, c: 3 };
    const b = { a: 1, b: 2, c: 3 };

    expect(deterministicStringify(a)).toBe(deterministicStringify(b));
  });

  it('should sort keys in lexicographic order', () => {
    const result = deterministicStringify({ z: 1, a: 2, m: 3 });
    expect(result).toBe('{"a":2,"m":3,"z":1}');
  });

  it('should handle nested objects recursively', () => {
    const result = deterministicStringify({ c: { z: 1, a: 2 }, b: 3 });
    expect(result).toBe('{"b":3,"c":{"a":2,"z":1}}');
  });

  it('should preserve array order', () => {
    const result = deterministicStringify({ items: [3, 1, 2] });
    expect(result).toBe('{"items":[3,1,2]}');
  });

  it('should handle null values', () => {
    const result = deterministicStringify({ a: null, b: 1 });
    expect(result).toBe('{"a":null,"b":1}');
  });

  it('should handle primitive values', () => {
    expect(deterministicStringify(42)).toBe('42');
    expect(deterministicStringify('hello')).toBe('"hello"');
    expect(deterministicStringify(true)).toBe('true');
    expect(deterministicStringify(null)).toBe('null');
  });

  it('should handle empty objects and arrays', () => {
    expect(deterministicStringify({})).toBe('{}');
    expect(deterministicStringify([])).toBe('[]');
  });

  it('should handle mixed nested structures', () => {
    const obj = {
      roles: ['admin', 'user'],
      meta: { version: 2, enabled: true },
      name: 'test',
    };
    const result = deterministicStringify(obj);
    expect(result).toBe(
      '{"meta":{"enabled":true,"version":2},"name":"test","roles":["admin","user"]}'
    );
  });

  it('should match a known deterministic hash input', () => {
    const authContext = {
      roles: ['Data', 'Financial', 'Scraper'],
      subject: 'financial-scraper-service',
      tenantId: 'instance-1',
    };
    const serialised = deterministicStringify(authContext);
    expect(serialised).toBe(
      '{"roles":["Data","Financial","Scraper"],"subject":"financial-scraper-service","tenantId":"instance-1"}'
    );
  });

  it('should be idempotent for the same input', () => {
    const obj = { x: 10, y: { z: 20, w: 30 }, arr: [1, 2] };
    const first = deterministicStringify(obj);
    const second = deterministicStringify(obj);
    expect(first).toBe(second);
  });
});

import { describe, it, expect } from '@jest/globals';
import { sanitizeForLog } from '../../src/utils/sanitize';

describe('sanitizeForLog', () => {
  it('should redact PEM content in strings', () => {
    const pemStr =
      'some text\n-----BEGIN CERTIFICATE-----\nZm9v\n-----END CERTIFICATE-----\nmore text';
    expect(sanitizeForLog(pemStr)).toBe('some text\n[REDACTED PEM]\nmore text');
  });

  it('should return strings without PEM content unchanged', () => {
    expect(sanitizeForLog('hello world')).toBe('hello world');
  });

  it('should convert Error objects to safe shape', () => {
    const err = new Error('test error');
    const result = sanitizeForLog(err) as Record<string, unknown>;
    expect(result).toHaveProperty('name', 'Error');
    expect(result).toHaveProperty('message', 'test error');
    expect(result).toHaveProperty('stack');
  });

  it('should handle Error instances without a stack property', () => {
    const err = new Error('test');
    Object.defineProperty(err, 'stack', { value: undefined });
    const result = sanitizeForLog(err) as Record<string, unknown>;
    expect(result).toHaveProperty('name', 'Error');
    expect(result).toHaveProperty('message', 'test');
    expect(result).not.toHaveProperty('stack');
  });

  it('should handle plain objects with name/message but not Error instances', () => {
    const err = { name: 'TypeError', message: 'bad' };
    const result = sanitizeForLog(err) as Record<string, unknown>;
    expect(result).toHaveProperty('name', 'TypeError');
    expect(result).toHaveProperty('message', 'bad');
    expect(result).not.toHaveProperty('stack');
  });

  it('should map arrays recursively', () => {
    const input = ['a', new Error('err'), { key: '-----BEGIN KEY-----\nxxxx\n-----END KEY-----' }];
    const result = sanitizeForLog(input) as unknown[];
    expect(result[0]).toBe('a');
    expect((result[1] as Record<string, unknown>).message).toBe('err');
    expect((result[2] as Record<string, unknown>).key).toBe('[REDACTED PEM]');
  });

  it('should clone plain objects with recursive sanitization', () => {
    const input = {
      password: 'secret',
      nested: {
        cert: '-----BEGIN CERTIFICATE-----\nZm9v\n-----END CERTIFICATE-----',
      },
    };
    const result = sanitizeForLog(input) as Record<string, unknown>;
    expect(result).toEqual({
      password: 'secret',
      nested: { cert: '[REDACTED PEM]' },
    });
  });

  it('should return primitives unchanged', () => {
    expect(sanitizeForLog(42)).toBe(42);
    expect(sanitizeForLog(true)).toBe(true);
    expect(sanitizeForLog(null)).toBeNull();
    expect(sanitizeForLog(undefined)).toBeUndefined();
  });
});

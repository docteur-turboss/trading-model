import { describe, it, expect, beforeEach } from 'vitest';
import { detectLanguage } from '../../src/i18n/config';

describe('detectLanguage', () => {
  beforeEach(() => {
    delete (globalThis as Record<string, unknown>).navigator;
  });

  it('should return en when navigator is undefined', () => {
    expect(detectLanguage()).toBe('en');
  });

  it('should return en when navigator.language is undefined', () => {
    (globalThis as Record<string, unknown>).navigator = {} as Navigator;
    expect(detectLanguage()).toBe('en');
  });

  it('should return en when language does not start with fr', () => {
    (globalThis as Record<string, unknown>).navigator = {
      language: 'en-US',
    } as Navigator;
    expect(detectLanguage()).toBe('en');
  });

  it('should return fr when language starts with fr', () => {
    (globalThis as Record<string, unknown>).navigator = {
      language: 'fr-FR',
    } as Navigator;
    expect(detectLanguage()).toBe('fr');
  });

  it('should return fr when language is exactly fr', () => {
    (globalThis as Record<string, unknown>).navigator = {
      language: 'fr',
    } as Navigator;
    expect(detectLanguage()).toBe('fr');
  });
});

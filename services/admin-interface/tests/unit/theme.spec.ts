import { describe, it, expect } from 'vitest';
import { theme } from '../../src/theme';

describe('theme', () => {
  it('should export a valid MUI theme', () => {
    expect(theme).toBeDefined();
    expect(theme.palette.primary.main).toBe('#1976d2');
    expect(theme.palette.secondary.main).toBe('#9e9e9e');
    expect(theme.palette.success.main).toBe('#2e7d32');
    expect(theme.palette.warning.main).toBe('#ed6c02');
    expect(theme.palette.error.main).toBe('#d32f2f');
    expect(theme.palette.info.main).toBe('#0288d1');
    expect(theme.palette.background.default).toBe('#f5f5f5');
    expect(theme.shape.borderRadius).toBe(8);
  });

  it('should have typography settings', () => {
    expect(theme.typography.fontFamily).toContain('Inter');
    expect(theme.typography.h4).toBeDefined();
  });

  it('should have component overrides for MuiCard, MuiTableHead, MuiChip', () => {
    expect(theme.components?.MuiCard).toBeDefined();
    expect(theme.components?.MuiTableHead).toBeDefined();
    expect(theme.components?.MuiChip).toBeDefined();
  });
});

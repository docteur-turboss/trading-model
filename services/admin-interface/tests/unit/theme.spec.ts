import { describe, expect, it } from "vitest";
import { THEME } from "../../src/THEME";

describe("THEME", () => {
	it("should export a valid MUI THEME", () => {
		expect(THEME).toBeDefined();
		expect(THEME.palette.primary.main).toBe("#1976d2");
		expect(THEME.palette.secondary.main).toBe("#9e9e9e");
		expect(THEME.palette.success.main).toBe("#2e7d32");
		expect(THEME.palette.warning.main).toBe("#ed6c02");
		expect(THEME.palette.error.main).toBe("#d32f2f");
		expect(THEME.palette.info.main).toBe("#0288d1");
		expect(THEME.palette.background.default).toBe("#f5f5f5");
		expect(THEME.shape.borderRadius).toBe(8);
	});

	it("should have typography settings", () => {
		expect(THEME.typography.fontFamily).toContain("Inter");
		expect(THEME.typography.h4).toBeDefined();
	});

	it("should have component overrides for MuiCard, MuiTableHead, MuiChip", () => {
		expect(THEME.components?.MuiCard).toBeDefined();
		expect(THEME.components?.MuiTableHead).toBeDefined();
		expect(THEME.components?.MuiChip).toBeDefined();
	});
});

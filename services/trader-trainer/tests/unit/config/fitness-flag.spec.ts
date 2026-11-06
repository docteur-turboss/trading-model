import { describe, expect, it } from "@jest/globals";
import { FitnessType } from "../../../src/domain/genetic-algorithm/genome-control";
import { effectiveFitnessType } from "../../../src/domain/training-settings";

describe("FEATURE_RISK_ADJUSTED_FITNESS", () => {
	it("keeps the configured fitness when on or unset", () => {
		const base = { TRAINER_FITNESS_TYPE: FitnessType.Sharpe };
		expect(effectiveFitnessType(base)).toBe(FitnessType.Sharpe);
		expect(
			effectiveFitnessType({ ...base, FEATURE_RISK_ADJUSTED_FITNESS: true })
		).toBe(FitnessType.Sharpe);
	});

	it("forces total_pnl when off", () => {
		expect(
			effectiveFitnessType({
				TRAINER_FITNESS_TYPE: FitnessType.Sharpe,
				FEATURE_RISK_ADJUSTED_FITNESS: false,
			})
		).toBe(FitnessType.TotalPnl);
	});
});

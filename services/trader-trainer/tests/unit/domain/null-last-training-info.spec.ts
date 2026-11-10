import { describe, expect, it } from "@jest/globals";
import { NullLastTrainingInfo } from "../../../src/domain/training-state";

describe("NullLastTrainingInfo", () => {
	it("starts at generation 0 with no summary (format unchanged)", () => {
		const info = new NullLastTrainingInfo();
		expect(info.generation).toBe(0);
		expect(info.symbol).toBe("");
		expect(info.buildBestAgentSummary()).toBeNull();
	});
});

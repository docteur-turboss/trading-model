import { describe, expect, it } from "@jest/globals";
import { TrainingEvent } from "../../src/training-events";

describe("TrainingEvent", () => {
	it("names the model-published domain event", () => {
		expect(TrainingEvent.ModelPublished).toBe("training.model.published");
	});
});

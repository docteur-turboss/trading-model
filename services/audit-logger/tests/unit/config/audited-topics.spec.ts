import { TrainingEvent } from "@trading-model/contracts/training-events";
import { auditedTopics } from "../../../src/config/audited-topics";

describe("auditedTopics", () => {
	it("subscribes to the model publication", () => {
		expect(auditedTopics()).toContain(TrainingEvent.ModelPublished);
	});
});

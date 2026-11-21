import { describe, expect, it } from "@jest/globals";
import { busJournalFromEnv } from "../../src/create-message-manager";

describe("busJournalFromEnv", () => {
	it("should refuse an env without Redis settings: the bus has no other transport", () => {
		expect(() => busJournalFromEnv({})).toThrow("REDIS_URL or REDIS_SENTINELS");
	});
});

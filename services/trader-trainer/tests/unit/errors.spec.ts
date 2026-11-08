import { describe, expect, it } from "@jest/globals";
import { agentError } from "../../src/shared/errors";

describe("trader-trainer errors", () => {
	it("build errors carrying their cause", () => {
		const cause = new Error("root");
		const e = agentError("ML failure", { cause });
		expect(e.cause).toBe(cause);
	});
});

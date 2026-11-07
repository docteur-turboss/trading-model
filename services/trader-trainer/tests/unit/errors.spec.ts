import { describe, expect, it } from "@jest/globals";
import { agentError, isAgentError } from "../../src/shared/errors";

describe("trader-trainer errors", () => {
	it("build errors matched by the guard", () => {
		const cause = new Error("root");
		const e = agentError("ML failure", { cause });
		expect(isAgentError(e)).toBe(true);
		expect(e.cause).toBe(cause);
		expect(isAgentError(new Error("x"))).toBe(false);
	});
});

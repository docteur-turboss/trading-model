import { PING_PATH } from "../src/server/constants";

describe("PING_PATH", () => {
	it("should equal /ping", () => {
		expect(PING_PATH).toBe("/ping");
	});
});

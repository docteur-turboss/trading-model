import { Protocol } from "../src/contracts/service-registry.types";

describe("Protocol", () => {
	it("has expected values", () => {
		expect(Protocol.Http).toBe("http");
		expect(Protocol.Https).toBe("https");
		expect(Protocol.Mtls).toBe("mtls");
	});
});

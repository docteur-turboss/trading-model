import Redis from "ioredis";

// createSentinel retires the failover detector through ioredis private fields
// with optional chaining: a rename in an ioredis update would turn that fix
// into a silent no-op. This spec breaks instead.
describe("ioredis Sentinel internals used by createSentinel", () => {
	it("exposes connector.failoverDetector with cleanup()", () => {
		const client = new Redis({
			sentinels: [{ host: "127.0.0.1", port: 26379 }],
			name: "mymaster",
			lazyConnect: true,
		});
		const connector = (client as unknown as { connector?: object }).connector;
		expect(connector).toBeDefined();
		expect(connector).toHaveProperty("failoverDetector", null);
		const { FailoverDetector } = jest.requireActual(
			"ioredis/built/connectors/SentinelConnector/FailoverDetector"
		);
		expect(typeof FailoverDetector.prototype.cleanup).toBe("function");
		client.disconnect();
	});
});

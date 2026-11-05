import { afterEach, describe, expect, it, jest } from "@jest/globals";
import type Redis from "ioredis";
import { createSentinel } from "../../src/redis-client-factories";

interface ConnectorInternals {
	failoverDetector?: { cleanup(): void } | null;
}

function connectorOf(client: Redis): ConnectorInternals {
	return (client as unknown as { connector: ConnectorInternals }).connector;
}

describe("createSentinel — failover detector of a closed connection", () => {
	let client: Redis | undefined;

	afterEach(() => {
		client?.disconnect();
		client = undefined;
	});

	// A detector left from a closed connection that sees +switch-master while
	// the client reconnects aborts the reconnect: ioredis then ends the client
	// and rejects every queued command with "Connection is closed." (#451).
	it("should stop the detector when the connection closes", () => {
		client = createSentinel({
			sentinels: [{ host: "127.0.0.1" as never, port: 26379 as never }],
			name: "mymaster",
		});
		const cleanup = jest.fn();
		connectorOf(client).failoverDetector = { cleanup };

		client.emit("close");

		expect(cleanup).toHaveBeenCalledTimes(1);
	});

	it("should tolerate a close before any detector exists", () => {
		client = createSentinel({
			sentinels: [{ host: "127.0.0.1" as never, port: 26379 as never }],
			name: "mymaster",
		});

		expect(() => client?.emit("close")).not.toThrow();
	});
});

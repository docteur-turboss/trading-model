import { execFileSync } from "node:child_process";
import { describe, expect, it, jest } from "@jest/globals";
import {
	containerHealth,
	externalRequest,
	GATEWAY_API_KEY,
	metric,
	persistedCandles,
	eventually as poll,
} from "./helpers";

/**
 * Restarts core services and checks the mesh heals by itself. Runs with the
 * rest of the E2E suites serially (maxWorkers: 1): the restarts would break
 * concurrent suites.
 */

const RECOVERY_TIMEOUT_MS = 90_000;

jest.setTimeout(RECOVERY_TIMEOUT_MS + 60_000);

function eventually<T>(
	description: string,
	probe: () => T | undefined,
	timeoutMs = RECOVERY_TIMEOUT_MS
): Promise<T> {
	return poll(description, probe, { timeoutMs, intervalMs: 3000 });
}

function restart(container: string): Promise<string> {
	execFileSync("docker", ["restart", container], { stdio: "ignore" });
	return eventually(`${container} healthy`, () =>
		containerHealth(container) === "healthy" ? "healthy" : undefined
	);
}

describe("Resilience E2E", () => {
	// The gateway resolves the Service DNS name, never the registry (ADR-0072).
	it("routes to a healthy service while Redis, hence the registry, is down", async () => {
		execFileSync("docker", ["stop", "trading-redis"], { stdio: "ignore" });
		try {
			// Query unseen by the other suites: not served from the gateway cache.
			const { status } = await externalRequest(
				"/v2/financial-scraper/candles/symbols/BTCUSDT?limit=7",
				{ headers: { "x-api-key": GATEWAY_API_KEY } }
			);
			expect(status).toBe(200);
		} finally {
			execFileSync("docker", ["start", "trading-redis"], { stdio: "ignore" });
			await eventually("trading-redis healthy", () =>
				containerHealth("trading-redis") === "healthy" ? true : undefined
			);
		}
	});

	it("keeps accepting heartbeats across a discovery restart", async () => {
		await restart("trading-discovery");

		// Instance tokens live in Redis, shared by every replica: they survive
		// the restart. A client whose token is lost anyway re-registers on its
		// first rejected heartbeat instead of after three failures.
		const accepted = await eventually("heartbeats accepted again", () => {
			const ok = metric(
				"https://discovery-server:3000/metrics",
				/^http_requests_total\{method="POST",path="\/heartbeat",status="200"\} (\S+)$/m
			);
			return ok >= 3 ? ok : undefined;
		});
		const rejected = metric(
			"https://discovery-server:3000/metrics",
			/^http_requests_total\{method="POST",path="\/heartbeat",status="401"\} (\S+)$/m
		);
		expect(accepted).toBeGreaterThanOrEqual(3);
		// At most one rejected heartbeat per registered service (5 of them).
		expect(rejected).toBeLessThanOrEqual(5);
	});

	// The scraper persists before publishing (publish cursor): neither a bus
	// outage nor a scraper restart during it may stop the persistence. The stub
	// closes one candle a minute.
	it(
		"keeps persisting candles during a bus outage (Redis down), across a scraper restart",
		async () => {
			const before = persistedCandles("BTCUSDT");

			execFileSync("docker", ["stop", "trading-redis"], { stdio: "ignore" });
			try {
				await eventually("a candle persisted while the bus is down", () =>
					persistedCandles("BTCUSDT") > before ? true : undefined
				);
				// Not "healthy": its readiness needs the registry, which lives in the Redis that is down.
				execFileSync("docker", ["restart", "trading-scraper"], {
					stdio: "ignore",
				});
				const afterRestart = persistedCandles("BTCUSDT");
				await eventually("a candle persisted after the scraper restart", () =>
					persistedCandles("BTCUSDT") > afterRestart ? true : undefined
				);
			} finally {
				execFileSync("docker", ["start", "trading-redis"], {
					stdio: "ignore",
				});
				await eventually("trading-redis healthy", () =>
					containerHealth("trading-redis") === "healthy" ? true : undefined
				);
			}
		},
		6 * RECOVERY_TIMEOUT_MS
	);
});

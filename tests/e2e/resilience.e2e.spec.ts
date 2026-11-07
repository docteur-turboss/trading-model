import { execFileSync } from "node:child_process";
import { describe, expect, it, jest } from "@jest/globals";
import {
	containerHealth,
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
	it("restores the trainer's subscriptions after a message-manager restart", async () => {
		await restart("trading-message");

		// message-manager keeps subscriptions in memory: the trainer renews them.
		const subscribers = await eventually("trainer resubscribed", () => {
			const count = metric(
				"https://message-manager:3000/metrics",
				/^mm_subscription_count\{topic="market\.candlestick\.series\.fetch"\} (\S+)$/m
			);
			return count > 0 ? count : undefined;
		});
		expect(subscribers).toBeGreaterThan(0);
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

	// The scraper persists before publishing and sends the waiting candles from
	// MySQL (publish cursor): neither a bus outage nor a scraper restart during
	// it may cost the trainer a candle. The stub closes one candle a minute.
	it(
		"sends the trainer every candle persisted during a message-manager outage, across a scraper restart",
		async () => {
			const trainerCandles = () =>
				metric(
					"https://trader-trainer:3000/metrics",
					/^tt_market_data_buffer_size\{symbol="BTCUSDT"\} (\S+)$/m
				);
			const before = persistedCandles("BTCUSDT");

			execFileSync("docker", ["stop", "trading-message"], { stdio: "ignore" });
			try {
				await eventually("a candle persisted while the bus is down", () =>
					persistedCandles("BTCUSDT") > before ? true : undefined
				);
				// The candles waiting for the bus are in MySQL, not in the process.
				await restart("trading-scraper");
			} finally {
				execFileSync("docker", ["start", "trading-message"], {
					stdio: "ignore",
				});
				await eventually("trading-message healthy", () =>
					containerHealth("trading-message") === "healthy" ? true : undefined
				);
			}

			// The trainer must renew its subscriptions before message-manager
			// accepts the waiting candles: until then they are refused and stay
			// in MySQL.
			await eventually("trainer resubscribed", () =>
				metric(
					"https://message-manager:3000/metrics",
					/^mm_subscription_count\{topic="market\.candlestick\.series\.fetch"\} (\S+)$/m
				) > 0
					? true
					: undefined
			);

			// Fixed target: the stub keeps closing a candle a minute, so comparing
			// with the live MySQL count races the next candle.
			const target = persistedCandles("BTCUSDT");
			const caughtUp = await eventually(
				"trainer caught up with MySQL",
				() => {
					const received = trainerCandles();
					return received >= target ? received : undefined;
				},
				2 * RECOVERY_TIMEOUT_MS
			);
			expect(caughtUp).toBeGreaterThan(before);
		},
		6 * RECOVERY_TIMEOUT_MS
	);
});

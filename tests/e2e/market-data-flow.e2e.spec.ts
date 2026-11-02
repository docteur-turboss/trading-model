import { execFileSync } from "node:child_process";
import { describe, expect, it, jest } from "@jest/globals";

/**
 * Market data flow: Binance (stub) → financial-scraper cron → MySQL, and
 * financial-scraper → message-manager → trader-trainer buffer.
 *
 * Health checks stay green while this path is broken (2026-10: the scrape
 * cron never started and nothing was published), so this spec asserts the
 * data itself. Needs the E2E overlay (tests/e2e/docker-compose.e2e.yml).
 *
 * Services only accept SPIFFE mTLS clients, so the assertions run inside the
 * stack: MySQL through the mysql CLI, the trainer metrics through curl in the
 * scraper container with its SVID (the scraper is an allowed trainer caller).
 */

const FLOW_TIMEOUT_MS = 120_000;
const POLL_INTERVAL_MS = 5_000;
const SYMBOL = "BTCUSDT";

jest.setTimeout(FLOW_TIMEOUT_MS + 30_000);

function dockerExec(container: string, command: string[]): string {
	return execFileSync("docker", ["exec", container, ...command], {
		encoding: "utf8",
		stdio: ["ignore", "pipe", "pipe"],
	});
}

async function waitFor<T>(
	description: string,
	probe: () => T | undefined
): Promise<T> {
	const deadline = Date.now() + FLOW_TIMEOUT_MS;
	let lastError: unknown;
	while (Date.now() < deadline) {
		try {
			const value = probe();
			if (value !== undefined) {
				return value;
			}
		} catch (error) {
			lastError = error;
		}
		await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
	}
	throw new Error(
		`Timed out after ${FLOW_TIMEOUT_MS}ms waiting for ${description}` +
			(lastError ? `: ${String(lastError)}` : "")
	);
}

function persistedCandles(symbol: string): number {
	const output = dockerExec("trading-mysql", [
		"sh",
		"-c",
		`mysql -N -B -uroot -p"$MYSQL_ROOT_PASSWORD" "$MYSQL_DATABASE" -e "SELECT COUNT(*) FROM market_candles WHERE symbol='${symbol}'"`,
	]);
	return Number(output.trim());
}

function trainerBufferSize(symbol: string): number {
	const metrics = dockerExec("trading-scraper", [
		"curl",
		"-sf",
		"--cacert",
		"/run/spire/svid/bundle.pem",
		"--cert",
		"/run/spire/svid/svid.pem",
		"--key",
		"/run/spire/svid/svid_key.pem",
		"https://trader-trainer:3000/metrics",
	]);
	const match = metrics.match(
		new RegExp(
			`^tt_market_data_buffer_size\\{symbol="${symbol}"\\} (\\S+)$`,
			"m"
		)
	);
	return match ? Number(match[1]) : 0;
}

describe("Market data flow E2E", () => {
	it("persists the candles the scraper fetches from Binance", async () => {
		const count = await waitFor(`${SYMBOL} candles in MySQL`, () => {
			const rows = persistedCandles(SYMBOL);
			return rows > 0 ? rows : undefined;
		});
		expect(count).toBeGreaterThan(0);
	});

	it("delivers the published market data to the trainer", async () => {
		const size = await waitFor(
			`${SYMBOL} candles in the trainer buffer`,
			() => {
				const entries = trainerBufferSize(SYMBOL);
				return entries > 0 ? entries : undefined;
			}
		);
		expect(size).toBeGreaterThan(0);
	});
});

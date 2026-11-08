import { describe, expect, it, jest } from "@jest/globals";
import {
	CALLER,
	e2eTestTimeout,
	eventually,
	externalRequest,
	GATEWAY_API_KEY,
	meshRequest,
} from "./helpers";

/**
 * Training to download: Binance stub → scraper → trainer buffer → short GA run
 * → stored model + `training.model.published` → read through the gateway →
 * weights downloadable only by MODEL_DOWNLOAD_CALLERS (ADR-0022). Needs the E2E
 * overlay, which shrinks the training (tests/e2e/docker-compose.e2e.yml).
 */

const TRAINING_TIMEOUT_MS = 240_000;
const POLL = { timeoutMs: TRAINING_TIMEOUT_MS, intervalMs: 5_000 };
const SYMBOL = "BTCUSDT";
const TRAINER = "https://trader-trainer:3000";
const AUDIT = "https://audit-logger:3000";
const AUTH = { "x-api-key": GATEWAY_API_KEY };

jest.setTimeout(TRAINING_TIMEOUT_MS + e2eTestTimeout * 2);

interface ModelSummary {
	version: string;
	createdAt: string;
	sha256: string;
	metrics: Record<string, unknown>;
}

const PUBLISHED = "training.model.published";

/** Async poll with an explicit deadline (`eventually` takes a sync probe). */
async function pollUntil<T>(
	description: string,
	probe: () => Promise<T | undefined>
): Promise<T> {
	const deadline = Date.now() + POLL.timeoutMs;
	while (Date.now() < deadline) {
		const value = await probe().catch(() => undefined);
		if (value !== undefined) {
			return value;
		}
		await new Promise((resolve) => setTimeout(resolve, POLL.intervalMs));
	}
	throw new Error(
		`Timed out after ${POLL.timeoutMs}ms waiting for ${description}`
	);
}

let version = "";

describe("Model training flow E2E", () => {
	it("serves a published model manifest through the gateway", async () => {
		const models = await pollUntil(
			`a ${SYMBOL} model via the gateway`,
			async () => {
				const { status, body } = await externalRequest(
					`/v1/trader-trainer/models/${SYMBOL}`,
					{ headers: AUTH }
				);
				const data =
					status === 200
						? (JSON.parse(body) as { data: ModelSummary[] }).data
						: [];
				return data.length > 0 ? data : undefined;
			}
		);
		const [latest] = models;
		version = latest.version;
		expect(version).not.toBe("");
		expect(latest.sha256).toMatch(/^[0-9a-f]{64}$/);
		expect(Number.isNaN(Date.parse(latest.createdAt))).toBe(false);
		expect(Object.keys(latest.metrics).length).toBeGreaterThan(0);

		const manifest = await externalRequest(
			`/v1/trader-trainer/models/${SYMBOL}/${version}`,
			{ headers: AUTH }
		);
		expect(manifest.status).toBe(200);
		expect(
			(JSON.parse(manifest.body) as { data: { symbol: string } }).data.symbol
		).toBe(SYMBOL);
	});

	it(`records ${PUBLISHED} in the audit trail`, async () => {
		const found = await eventually(
			`${PUBLISHED} in audit-logger`,
			() => {
				const { status, body } = meshRequest(
					CALLER.scraper,
					`${AUDIT}/events?topic=${PUBLISHED}&limit=100`
				);
				if (status !== 200) {
					return;
				}
				const matches = (
					JSON.parse(body) as { docs: Array<{ payload: { symbol?: string } }> }
				).docs.filter((doc) => doc.payload?.symbol === SYMBOL);
				return matches.length > 0 ? matches : undefined;
			},
			POLL
		);
		expect(found.length).toBeGreaterThan(0);
	});

	it("lets a MODEL_DOWNLOAD_CALLERS service download the weights", () => {
		const { status, body } = meshRequest(
			CALLER.scraper,
			`${TRAINER}/models/${SYMBOL}/${version}/weights`
		);
		expect(status).toBe(200);
		expect(body.length).toBeGreaterThan(0);
	});

	it("refuses the weights to a service that is not listed", () => {
		const { status } = meshRequest(
			CALLER.message,
			`${TRAINER}/models/${SYMBOL}/${version}/weights`
		);
		expect(status).toBe(403);
	});

	it("does not expose the weights through the gateway", async () => {
		const { status } = await externalRequest(
			`/v1/trader-trainer/models/${SYMBOL}/${version}/weights`,
			{ headers: AUTH }
		);
		expect(status).toBe(404);
	});
});

import { mkdtemp, rm } from "node:fs/promises";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it, jest } from "@jest/globals";
import { TradingSymbol } from "@trading-model/primitives/primitives";
import { Leadership } from "@trading-model/reliability/leadership";
import express from "express";

jest.mock("@trading-model/contracts/logger-registry", () => ({
	getLogger: () => ({
		info: jest.fn(),
		warn: jest.fn(),
		error: jest.fn(),
		debug: jest.fn(),
	}),
}));

import { TRAINER_ROUTES } from "../../../src/adapters/inbound/http/routes";
import { FileModelArtifactStore } from "../../../src/adapters/outbound/file-model-artifact-store";
import { Trainer } from "../../../src/application/trainer";
import { NETWORK_INPUT_LAYOUT } from "../../../src/domain/agent/agent-state";
import { createDefaultGenome } from "../../../src/domain/genetic-algorithm/factory";
import { MarketDataBuffer } from "../../../src/domain/market-data-buffer";

const BTC = TradingSymbol.of("BTCUSDT");
const SETTINGS = {
	validationSplit: 0.2,
	testSplit: 0.15,
	walkForwardFolds: 1,
	generations: 2,
	populationSize: 4,
	timeBudgetMs: 60_000,
	episodesPerIndividual: 1,
	fitnessType: "total_pnl",
} as never;

/**
 * ADR-0058: during a rollout the new pod is ready before the old one releases
 * the Lease. It does not train, yet it answers the read routes from the shared
 * checkpoint volume and the summaries rehydrated at startup (#533).
 */
describe("trainer pod that does not hold the Lease", () => {
	let root: string;
	let server: Server;
	let baseUrl: string;
	let version: string;
	let leadership: Leadership;
	const training = {
		start: jest.fn<() => void>(),
		stop: jest.fn(async () => {
			// Never started.
		}),
	};

	beforeAll(async () => {
		root = await mkdtemp(join(tmpdir(), "non-holder-"));
		const models = new FileModelArtifactStore({ root, retention: 5 });
		// Stored by the holder (the old pod).
		const genome = createDefaultGenome("stored-by-holder");
		const saved = await models.save({
			symbol: "BTCUSDT",
			instanceId: "trader-trainer-old",
			bestGenome: genome,
			weights: new Float32Array([0.5, -0.25, 1]),
			features: NETWORK_INPUT_LAYOUT,
			normalization: {},
			summary: {
				id: genome.id,
				generation: 3,
				fitness: 1.5,
				sharpe: 0.9,
				avgPnl: 2,
				maxDrawdown: 4,
				evaluatedOn: "test",
			} as never,
		});
		version = saved.version;

		const trainer = new Trainer(new MarketDataBuffer({ maxSize: 500 }), {
			settings: SETTINGS,
			models,
		});
		await trainer.rehydrate([BTC]);
		const heldByAnother = {
			tryAcquireOrRenew: async () => false,
			release: async () => {
				// Not held.
			},
		};
		leadership = new Leadership(
			heldByAnother,
			training,
			() => undefined,
			"Trainer",
			{
				retryMs: 60_000,
				renewDeadlineMs: 10_000,
			}
		);
		leadership.start();
		// First attempt (0 ms timer), then its promise.
		await new Promise((resolve) => setTimeout(resolve, 10));

		const app = express();
		app.use(TRAINER_ROUTES(trainer, { models, downloadCallers: [] }));
		await new Promise<void>((resolve) => {
			server = app.listen(0, () => resolve());
		});
		baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
	});

	afterAll(async () => {
		await leadership.stop();
		await new Promise((resolve) => server.close(resolve));
		await rm(root, { recursive: true, force: true });
	});

	async function get(path: string) {
		const res = await fetch(`${baseUrl}${path}`);
		return { status: res.status, body: (await res.json()) as any };
	}

	it("does not train", () => {
		expect(leadership.leading).toBe(false);
		expect(training.start).not.toHaveBeenCalled();
	});

	it("answers /training-status", async () => {
		const { status, body } = await get("/training-status");

		expect(status).toBe(200);
		expect(body.data.training).toBe(false);
	});

	it("answers /best-agent with the agent the holder stored", async () => {
		const { status, body } = await get("/best-agent");

		expect(status).toBe(200);
		expect(body.data.agent).toMatchObject({ id: "stored-by-holder" });
	});

	it("answers /models/:symbol and /training-agents/:symbol from the shared volume", async () => {
		const models = await get("/models/BTCUSDT");
		const agent = await get("/training-agents/BTCUSDT");

		expect(models.status).toBe(200);
		expect(models.body.data).toEqual([expect.objectContaining({ version })]);
		expect(agent.status).toBe(200);
		expect(agent.body.data.model).toMatchObject({ version });
	});
});

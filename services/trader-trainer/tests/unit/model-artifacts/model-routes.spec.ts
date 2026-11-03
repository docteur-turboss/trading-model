import { createHash } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it, jest } from "@jest/globals";
import {
	type ApiRoute,
	responseIssues,
} from "@trading-model/http/adapters/inbound/api-route/api-route";
import express from "express";

jest.mock("../../../src/infrastructure/config/env", () => ({
	ENV: { INSTANCE_ID: "trader-trainer-1" },
}));

import { TRAINER_API } from "../../../src/adapters/inbound/http/api-routes";
import { TRAINER_ROUTES } from "../../../src/adapters/inbound/http/routes";
import { FileModelArtifactStore } from "../../../src/adapters/outbound/file-model-artifact-store";
import { FEATURE_LAYOUT } from "../../../src/domain/feature-vector-codec";

const AGENT = {
	id: "g-1",
	generation: 3,
	fitness: 1.2,
	sharpe: 0.8,
	avgPnl: 12.5,
	maxDrawdown: 3.5,
	gaControl: {
		populationSize: 5,
		elitismFraction: 0.1,
		survivorFraction: 0.5,
		episodesPerIndividual: 2,
		selectionType: "tournament",
		fitnessType: "sharpe",
	},
	network: {
		inputDim: 32,
		outputDim: 3,
		hiddenLayers: [{ neurons: 16, activation: "relu" }],
	},
	rl: {
		gamma: 0.99,
		learningRate: 0.001,
		epsilonStart: 1,
		epsilonMin: 0.05,
		epsilonDecay: 0.995,
	},
};

/** A trainer that trained BTCUSDT and nothing else. */
const trainer = {
	isTraining: () => false,
	getCurrentSymbol: () => "BTCUSDT",
	getGeneration: () => 3,
	getBestAgentSummary: () => AGENT,
	getAllSnapshots: () => new Map(),
	getSnapshotForSymbol: (symbol: string) =>
		symbol === "BTCUSDT"
			? { generation: 3, buildBestAgentSummary: () => AGENT }
			: undefined,
} as never;

describe("trader-trainer model routes (ADR-0022)", () => {
	let root: string;
	let server: Server;
	let baseUrl: string;
	let version: string;
	let sha256: string;
	/** Who the weights route believes is calling (mTLS identity in production). */
	let caller: string | undefined;

	beforeAll(async () => {
		root = await mkdtemp(join(tmpdir(), "models-api-"));
		const models = new FileModelArtifactStore({ root, retention: 5 });
		const saved = await models.save({
			symbol: "BTCUSDT",
			instanceId: "trader-trainer-1",
			bestGenome: { id: "g-1", network: AGENT.network } as never,
			weights: new Float32Array([0.5, -0.25, 1]),
			features: FEATURE_LAYOUT,
			normalization: { candle: { close: { count: 3, mean: 1, m2: 0 } } },
			summary: AGENT as never,
		});
		version = saved.version;
		sha256 = saved.sha256;

		const app = express();
		app.use(
			TRAINER_ROUTES(trainer, {
				models,
				downloadCallers: ["trade-executor"],
				resolveCaller: () => caller,
			})
		);
		await new Promise<void>((resolve) => {
			server = app.listen(0, resolve);
		});
		baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
	});

	afterAll(async () => {
		await new Promise((resolve) => server.close(resolve));
		await rm(root, { recursive: true, force: true });
	});

	/** GET the path, check the JSON response against the route's entry. */
	async function get(route: ApiRoute, path: string) {
		const res = await fetch(`${baseUrl}${path}`);
		const body = await res.json();
		expect(responseIssues(route, res.status, body)).toEqual([]);
		return { status: res.status, body };
	}

	it("GET /training-agents/:symbol answers the latest model, not the population", async () => {
		const { status, body } = await get(
			TRAINER_API.trainingAgent,
			"/training-agents/BTCUSDT"
		);

		expect(status).toBe(200);
		expect(body.data.model).toMatchObject({ version, sha256 });
		expect(body.data).not.toHaveProperty("generationContext");
	});

	it("GET /models/:symbol lists the stored versions", async () => {
		const { status, body } = await get(
			TRAINER_API.listModels,
			"/models/BTCUSDT"
		);

		expect(status).toBe(200);
		expect(body.data).toEqual([
			expect.objectContaining({
				version,
				sha256,
				metrics: expect.objectContaining({ fitness: 1.2 }),
			}),
		]);
		expect((await get(TRAINER_API.listModels, "/models/ETHUSDT")).body).toEqual(
			{ data: [] }
		);
	});

	it("GET /models/:symbol/:version answers the manifest, without weights", async () => {
		const { status, body } = await get(
			TRAINER_API.getModel,
			`/models/BTCUSDT/${version}`
		);

		expect(status).toBe(200);
		expect(body.data).toMatchObject({
			version,
			weights: { length: 3, sha256 },
			features: { dim: 32 },
		});
		expect(JSON.stringify(body)).not.toContain("trainedWeights");
	});

	it.each([
		[
			"an unknown version",
			"/models/BTCUSDT/20201010T101010Z-0123456789ab",
			404,
		],
		["a malformed version", "/models/BTCUSDT/latest", 400],
		["a path traversal", "/models/..%2F..%2Fetc/x", 400],
	])("GET /models/:symbol/:version rejects %s", async (_label, path, expected) => {
		expect((await get(TRAINER_API.getModel, path)).status).toBe(expected);
	});

	describe("GET /models/:symbol/:version/weights", () => {
		it("answers 401 without a client identity", async () => {
			caller = undefined;

			const { status } = await get(
				TRAINER_API.getModelWeights,
				`/models/BTCUSDT/${version}/weights`
			);

			expect(status).toBe(401);
		});

		it("answers 403 to a service not in MODEL_DOWNLOAD_CALLERS", async () => {
			caller = "financial-scraper";

			const { status, body } = await get(
				TRAINER_API.getModelWeights,
				`/models/BTCUSDT/${version}/weights`
			);

			expect(status).toBe(403);
			expect(body).toEqual({
				error: "Model download not allowed",
				reason: "financial-scraper is not in MODEL_DOWNLOAD_CALLERS",
			});
		});

		it("sends the weights and their sha256 to an allowed caller", async () => {
			caller = "trade-executor";

			const res = await fetch(`${baseUrl}/models/BTCUSDT/${version}/weights`);
			const bytes = new Uint8Array(await res.arrayBuffer());

			expect(res.status).toBe(200);
			expect(
				responseIssues(TRAINER_API.getModelWeights, res.status, bytes)
			).toEqual([]);
			expect(res.headers.get("content-type")).toBe("application/octet-stream");
			expect(res.headers.get("x-model-sha256")).toBe(sha256);
			expect(createHash("sha256").update(bytes).digest("hex")).toBe(sha256);
			expect(Buffer.from(bytes).readFloatLE(4)).toBe(-0.25);
		});

		it("answers 404 for an unknown version, even to an allowed caller", async () => {
			caller = "trade-executor";

			const { status } = await get(
				TRAINER_API.getModelWeights,
				"/models/BTCUSDT/20201010T101010Z-0123456789ab/weights"
			);

			expect(status).toBe(404);
		});
	});
});

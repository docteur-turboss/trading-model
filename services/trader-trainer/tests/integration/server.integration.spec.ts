import http from "node:http";
import {
	afterEach,
	beforeEach,
	describe,
	expect,
	it,
	jest,
} from "@jest/globals";
import {
	type ApiRoute,
	responseIssues,
} from "@trading-model/http/adapters/inbound/api-route/api-route";
import express from "express";

jest.mock<{
	ENV: {
		NODE_ENV: string;
		PORT: number;
		TLS_KEY_PATH: string;
		TLS_CERT_PATH: string;
		TLS_CA_PATH: string;
		ADDRESS_MANAGER_URL: string;
		CACHE_TTL_MS: number;
		INSTANCE_ID: string;
		SERVICE_NAME: string;
		SERVICE_PING_TIMEOUT_MS: number;
		TOKEN_REFRESH_INTERVAL_MS: number;
		TTL_REFRESH_INTERVAL_MS: number;
		MESSAGE_CALLBACK_PATH: string;
		TRAINER_SYMBOLS: string;
		TRAINER_DATA_WINDOW: number;
		TRAINER_VALIDATION_SPLIT: number;
		TRAINER_GENERATIONS: number;
		TRAINER_POPULATION_SIZE: number;
		TRAINER_TIME_BUDGET_MS: number;
		TRAINER_EPISODES_PER_INDIVIDUAL: number;
		TRAINER_FITNESS_TYPE: string;
	};
}>("../../src/infrastructure/config/env", () => ({
	ENV: {
		NODE_ENV: "test",
		PORT: 0,
		TLS_KEY_PATH: "",
		TLS_CERT_PATH: "",
		TLS_CA_PATH: "",
		ADDRESS_MANAGER_URL: "http://localhost:3000",
		CACHE_TTL_MS: 5000,
		INSTANCE_ID: "test-instance",
		SERVICE_NAME: "trader-trainer",
		SERVICE_PING_TIMEOUT_MS: 5000,
		TOKEN_REFRESH_INTERVAL_MS: 30000,
		TTL_REFRESH_INTERVAL_MS: 30000,
		MESSAGE_CALLBACK_PATH: "/callback",
		TRAINER_SYMBOLS: "BTCUSDT",
		TRAINER_DATA_WINDOW: 500,
		TRAINER_VALIDATION_SPLIT: 0.2,
		TRAINER_GENERATIONS: 10,
		TRAINER_POPULATION_SIZE: 5,
		TRAINER_TIME_BUDGET_MS: 60000,
		TRAINER_EPISODES_PER_INDIVIDUAL: 2,
		TRAINER_FITNESS_TYPE: "total_pnl",
	},
}));

jest.mock("../../src/config/address-manager", () => ({
	ADDRESS_MANAGER_ROUTES: (): void => {},
	BOOTSTRAP_ADDRESS_MANAGER: (): { stop: () => void } => ({
		stop: (): void => {},
	}),
	AddressManager: { getAddress: (): null => null },
}));

jest.mock("../../src/config/message-manager", () => ({
	MessageManager: {
		on: (): void => {},
		intents: (): Promise<void> => Promise.resolve(),
		stopMessageManager: (): Promise<void> => Promise.resolve(),
	},
	MessageManagerListenExpress: (): void => {},
}));

import { TRAINER_API } from "../../src/adapters/inbound/http/api-routes";
import { TRAINER_ROUTES } from "../../src/adapters/inbound/http/routes";
import { Trainer } from "../../src/application/trainer";
import { FitnessType } from "../../src/domain/genetic-algorithm/genome-control";
import { MarketDataBuffer } from "../../src/domain/market-data-buffer";
import type { TrainingSettings } from "../../src/domain/training-settings";

/** Mirrors the TRAINER_* values of the mocked ENV above. */
const TEST_TRAINING_SETTINGS: TrainingSettings = {
	validationSplit: 0.2,
	walkForwardFolds: 1,
	generations: 10,
	populationSize: 5,
	timeBudgetMs: 60000,
	episodesPerIndividual: 2,
	fitnessType: FitnessType.TotalPnl,
};

/** A best agent summary as the trainer builds it. */
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
		inputDim: 8,
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

/** A genome with its trained weights, as the population holds it. */
const GENOME = {
	network: { layers: 2 },
	trainedWeights: new Float32Array([0.5, -0.25]),
};

/** Snapshot of a trained symbol. */
function snapshot(generationContext: unknown) {
	return {
		symbol: "BTCUSDT",
		generation: 3,
		generationContext,
		buildBestAgentSummary: () => AGENT,
	} as never;
}

function fetchJson(
	server: http.Server,
	path: string
): Promise<{ status: number; body: unknown }> {
	return new Promise((resolve, reject) => {
		const addr = server.address();
		if (!addr || typeof addr === "string") {
			reject(new Error("Server not listening"));
			return;
		}
		const req = http.get(`http://localhost:${addr.port}${path}`, (res) => {
			let data = "";
			res.on("data", (chunk: string) => {
				data += chunk;
			});
			res.on("end", () => {
				try {
					resolve({ status: res.statusCode ?? 500, body: JSON.parse(data) });
				} catch {
					resolve({ status: res.statusCode ?? 500, body: data });
				}
			});
			res.on("error", reject);
		});
		req.on("error", reject);
	});
}

describe("Server routes", () => {
	let trainer: Trainer;
	let dataBuffer: MarketDataBuffer;
	let server: http.Server;

	beforeEach(() => {
		dataBuffer = new MarketDataBuffer({ maxSize: 500 });
		trainer = new Trainer(dataBuffer, { settings: TEST_TRAINING_SETTINGS });
		const app = express();
		app.use(
			TRAINER_ROUTES(trainer, {
				models: {
					list: async () => [],
					manifest: async () => undefined,
					weights: async () => undefined,
					save: async () => {
						throw new Error("not used");
					},
				},
				downloadCallers: [],
			})
		);
		return new Promise<void>((resolve) => {
			server = app.listen(0, () => resolve());
		});
	});

	afterEach(() => {
		jest.restoreAllMocks();
		return new Promise<void>((resolve) => {
			if (server?.listening) {
				server.close(() => resolve());
			} else {
				resolve();
			}
		});
	});

	/** GET the path, check the response against the route's entry. */
	async function get(route: ApiRoute, path: string) {
		const result = await fetchJson(server, path);
		expect(responseIssues(route, result.status, result.body)).toEqual([]);
		return result;
	}

	it("GET /training-status should return idle status when no training is active", async () => {
		const result = await get(TRAINER_API.trainingStatus, "/training-status");

		expect(result.status).toBe(200);
		expect(result.body).toEqual({
			data: {
				training: false,
				symbol: "",
				generation: 0,
			},
		});
	});

	it("GET /best-agent should return 404 when no agent has been trained", async () => {
		const result = await get(TRAINER_API.bestAgent, "/best-agent");

		expect(result.status).toBe(404);
		expect(result.body).toEqual({
			error: "No trained agent available at the moment.",
		});
	});

	it("GET /best-agent should return the best agent once trained", async () => {
		jest.spyOn(trainer, "getBestAgentSummary").mockReturnValue(AGENT as never);

		const result = await get(TRAINER_API.bestAgent, "/best-agent");

		expect(result.status).toBe(200);
		expect(result.body).toMatchObject({
			data: { agent: AGENT, training: false },
		});
	});

	it("GET /training-agents should list the trained symbols", async () => {
		jest
			.spyOn(trainer, "getAllSnapshots")
			.mockReturnValue(new Map([["BTCUSDT", snapshot(null)]]) as never);

		const result = await get(TRAINER_API.trainingAgents, "/training-agents");

		expect(result.status).toBe(200);
		expect(result.body).toMatchObject({
			data: { agents: [{ symbol: "BTCUSDT", agent: AGENT, generation: 3 }] },
		});
	});

	it("GET /training-agents/:symbol should send the agent, without the population", async () => {
		jest
			.spyOn(trainer, "getSnapshotForSymbol")
			.mockReturnValue(
				snapshot({ generation: 3, population: [GENOME], archive: [] })
			);

		const result = await get(
			TRAINER_API.trainingAgent,
			"/training-agents/BTCUSDT"
		);

		expect(result.status).toBe(200);
		expect(result.body).toMatchObject({
			data: { symbol: "BTCUSDT", agent: AGENT, model: null },
		});
		// Weights and populations never leave through this route (ADR-0022).
		expect(JSON.stringify(result.body)).not.toContain("trainedWeights");
		expect(trainer.getSnapshotForSymbol).toHaveBeenCalledWith("BTCUSDT");
	});

	it("GET /training-agents/:symbol should return 404 for an untrained symbol", async () => {
		const result = await get(
			TRAINER_API.trainingAgent,
			"/training-agents/ETHUSDT"
		);

		expect(result.status).toBe(404);
		expect(result.body).toEqual({
			error: "No trained agent for symbol ETHUSDT.",
		});
	});
});

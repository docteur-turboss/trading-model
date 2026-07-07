import http from "node:http";
import {
	afterEach,
	beforeEach,
	describe,
	expect,
	it,
	jest,
} from "@jest/globals";
import { catchSync } from "@trading-model/common/middleware/catch-error";
import { ResponseException } from "@trading-model/common/middleware/response-exception";
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
	};
}>("../../src/config/env", () => ({
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

import { MarketDataBuffer } from "../../src/core/market-data-buffer";
import { Trainer } from "../../src/core/trainer";

function createRoutes(app: express.Application, trainer: Trainer): void {
	app.get(
		"/best-agent",
		catchSync((_req, res) => {
			const summary = trainer.getBestAgentSummary();
			if (!summary) {
				const response = ResponseException(
					"No trained agent available at the moment."
				).notFound();
				res.status(response.status).json({ data: response.data });
				return;
			}
			res.json({
				data: {
					agent: summary,
					training: trainer.isTraining(),
					symbol: trainer.getCurrentSymbol(),
					generation: trainer.getGeneration(),
				},
			});
		})
	);

	app.get(
		"/training-status",
		catchSync((_req, res) => {
			res.json({
				data: {
					training: trainer.isTraining(),
					symbol: trainer.getCurrentSymbol(),
					generation: trainer.getGeneration(),
				},
			});
		})
	);
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
		trainer = new Trainer(dataBuffer);
		const app = express();
		createRoutes(app, trainer);
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

	it("GET /training-status should return idle status when no training is active", async () => {
		const result = await fetchJson(server, "/training-status");

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
		const result = await fetchJson(server, "/best-agent");

		expect(result.status).toBe(404);
		expect(result.body).toHaveProperty("data");
	});
});

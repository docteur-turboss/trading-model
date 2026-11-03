import { describe, expect, it } from "@jest/globals";
import { z } from "zod";

const TRADER_TRAINER_ENV_SCHEMA = z.object({
	NODE_ENV: z
		.enum(["development", "test", "staging", "production"])
		.default("development"),
	PORT: z.coerce.number().int().positive().default(3000),
	TLS_KEY_PATH: z.string().min(1),
	TLS_CERT_PATH: z.string().min(1),
	TLS_CA_PATH: z.string().min(1),
	ADDRESS_MANAGER_URL: z.string(),
	CACHE_TTL_MS: z.coerce.number().int().positive().default(30000),
	INSTANCE_ID: z.string().min(1),
	SERVICE_NAME: z.string().min(1),
	SERVICE_PING_TIMEOUT_MS: z.coerce.number().int().positive().default(2000),
	TOKEN_REFRESH_INTERVAL_MS: z.coerce.number().int().positive().default(60000),
	TTL_REFRESH_INTERVAL_MS: z.coerce.number().int().positive().default(15000),
	MESSAGE_CALLBACK_PATH: z.string().min(1).default("message"),
	TRAINER_SYMBOLS: z.string().default("BTCUSDT,ETHUSDT"),
	TRAINER_DATA_WINDOW: z.coerce.number().int().positive().default(500),
	TRAINER_VALIDATION_SPLIT: z.coerce.number().min(0).max(1).default(0.2),
	TRAINER_GENERATIONS: z.coerce.number().int().positive().default(50),
	TRAINER_POPULATION_SIZE: z.coerce.number().int().positive().default(20),
	TRAINER_TIME_BUDGET_MS: z.coerce.number().int().positive().default(300000),
	TRAINER_EPISODES_PER_INDIVIDUAL: z.coerce
		.number()
		.int()
		.positive()
		.default(3),
});

function makeValidEnv(): Record<string, string> {
	return {
		NODE_ENV: "test",
		PORT: "3001",
		TLS_KEY_PATH: "/certs/key.pem",
		TLS_CERT_PATH: "/certs/cert.pem",
		TLS_CA_PATH: "/certs/ca.pem",
		ADDRESS_MANAGER_URL: "http://localhost:3000",
		INSTANCE_ID: "test-1",
		SERVICE_NAME: "trader-trainer",
		TRAINER_SYMBOLS: "BTCUSDT",
		TRAINER_VALIDATION_SPLIT: "0.2",
		TRAINER_GENERATIONS: "10",
		TRAINER_POPULATION_SIZE: "5",
		TRAINER_TIME_BUDGET_MS: "60000",
		TRAINER_EPISODES_PER_INDIVIDUAL: "2",
		CACHE_TTL_MS: "5000",
		SERVICE_PING_TIMEOUT_MS: "5000",
		TOKEN_REFRESH_INTERVAL_MS: "30000",
		TTL_REFRESH_INTERVAL_MS: "30000",
		MESSAGE_CALLBACK_PATH: "/callback",
	};
}

describe("Env Schema", () => {
	it("should parse a valid environment configuration", () => {
		const result = TRADER_TRAINER_ENV_SCHEMA.safeParse(makeValidEnv());

		expect(result.success).toBe(true);
	});

	it("should parse coerce string number to integer", () => {
		const env = makeValidEnv();
		env.TRAINER_POPULATION_SIZE = "10";

		const result = TRADER_TRAINER_ENV_SCHEMA.safeParse(env);

		expect(result.success).toBe(true);
		if (result.success) {
			expect(result.data.TRAINER_POPULATION_SIZE).toBe(10);
		}
	});

	it("should apply default values for optional trainer fields", () => {
		const env: Record<string, string> = {
			TLS_KEY_PATH: "/key.pem",
			TLS_CERT_PATH: "/cert.pem",
			TLS_CA_PATH: "/ca.pem",
			ADDRESS_MANAGER_URL: "http://localhost:3000",
			INSTANCE_ID: "test-1",
			SERVICE_NAME: "trader-trainer",
		};

		const result = TRADER_TRAINER_ENV_SCHEMA.safeParse(env);

		expect(result.success).toBe(true);
		if (result.success) {
			expect(result.data.NODE_ENV).toBe("development");
			expect(result.data.PORT).toBe(3000);
			expect(result.data.TRAINER_VALIDATION_SPLIT).toBe(0.2);
			expect(result.data.TRAINER_GENERATIONS).toBe(50);
			expect(result.data.TRAINER_POPULATION_SIZE).toBe(20);
			expect(result.data.TRAINER_SYMBOLS).toBe("BTCUSDT,ETHUSDT");
		}
	});

	it("should reject missing TLS_KEY_PATH", () => {
		const env = makeValidEnv();
		delete env.TLS_KEY_PATH;

		const result = TRADER_TRAINER_ENV_SCHEMA.safeParse(env);

		expect(result.success).toBe(false);
	});

	it("should reject TRAINER_VALIDATION_SPLIT above 1", () => {
		const env = makeValidEnv();
		env.TRAINER_VALIDATION_SPLIT = "1.5";

		const result = TRADER_TRAINER_ENV_SCHEMA.safeParse(env);

		expect(result.success).toBe(false);
	});

	it("should reject TRAINER_VALIDATION_SPLIT below 0", () => {
		const env = makeValidEnv();
		env.TRAINER_VALIDATION_SPLIT = "-0.1";

		const result = TRADER_TRAINER_ENV_SCHEMA.safeParse(env);

		expect(result.success).toBe(false);
	});

	it("should reject non-positive TRAINER_GENERATIONS", () => {
		const env = makeValidEnv();
		env.TRAINER_GENERATIONS = "0";

		const result = TRADER_TRAINER_ENV_SCHEMA.safeParse(env);

		expect(result.success).toBe(false);
	});

	it("should reject non-positive PORT", () => {
		const env = makeValidEnv();
		env.PORT = "-1";

		const result = TRADER_TRAINER_ENV_SCHEMA.safeParse(env);

		expect(result.success).toBe(false);
	});

	it("should reject missing INSTANCE_ID", () => {
		const env = makeValidEnv();
		delete env.INSTANCE_ID;

		const result = TRADER_TRAINER_ENV_SCHEMA.safeParse(env);

		expect(result.success).toBe(false);
	});

	it("should accept boundary TRAINER_VALIDATION_SPLIT of 0", () => {
		const env = makeValidEnv();
		env.TRAINER_VALIDATION_SPLIT = "0";

		const result = TRADER_TRAINER_ENV_SCHEMA.safeParse(env);

		expect(result.success).toBe(true);
	});

	it("should accept boundary TRAINER_VALIDATION_SPLIT of 1", () => {
		const env = makeValidEnv();
		env.TRAINER_VALIDATION_SPLIT = "1";

		const result = TRADER_TRAINER_ENV_SCHEMA.safeParse(env);

		expect(result.success).toBe(true);
	});
});

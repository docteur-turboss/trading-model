import { describe, expect, it, jest } from "@jest/globals";
import { TRADER_TRAINER_ENV_SCHEMA } from "../../../../src/infrastructure/config/env";

// Importing env.ts parses process.env into ENV; only the schema is under test here.
jest.mock("@trading-model/http/config/validate-env", () => ({
	validateEnv: () => ({}),
}));

function makeValidEnv(): Record<string, string> {
	return {
		NODE_ENV: "test",
		APP_NAME: "trader-trainer",
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
	it("rejects a signal key that is not SUBJECT:dimension:metric", () => {
		const parse = (keys: string) =>
			TRADER_TRAINER_ENV_SCHEMA.safeParse({
				...makeValidEnv(),
				TRAINER_SIGNAL_FEATURES: keys,
			}).success;

		expect(parse("BTC:social:pageviews, EA:macro:cpi")).toBe(true);
		expect(parse("BTC:social")).toBe(false);
		expect(parse("BTC:social:pageviews:x")).toBe(false);
	});

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
		const custom = TRADER_TRAINER_ENV_SCHEMA.safeParse({
			...env,
			TRAINER_INTERVAL_MS: "60000",
		});
		if (custom.success) {
			expect(custom.data.TRAINER_INTERVAL_MS).toBe(60000);
		}
	});

	it("should apply default values for optional trainer fields", () => {
		const env: Record<string, string> = {
			APP_NAME: "trader-trainer",
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
			expect(result.data.TRAINER_VALIDATION_SPLIT).toBe(0.15);
			expect(result.data.TRAINER_GENERATIONS).toBe(50);
			expect(result.data.TRAINER_POPULATION_SIZE).toBe(20);
			expect(result.data.TRAINER_INTERVAL_MS).toBe(14_400_000);
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

	it.each(["TRAINER_TEST_SPLIT", "TRAINER_VALIDATION_SPLIT"])(
		"should refuse %s of 0 or 1 and accept 0.15",
		(name) => {
			for (const bad of ["0", "1"]) {
				expect(
					TRADER_TRAINER_ENV_SCHEMA.safeParse({
						...makeValidEnv(),
						[name]: bad,
					}).success
				).toBe(false);
			}
			expect(
				TRADER_TRAINER_ENV_SCHEMA.safeParse({
					...makeValidEnv(),
					[name]: "0.15",
				}).success
			).toBe(true);
		}
	);

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
});

/**
 * Creates a mock env module for tests.
 * Returns the path to the module and the mock object.
 * Usage:
 *   jest.mock('../../src/config/env', () => ({ ENV: createMockEnv() }));
 */

export function createMockEnv(): Record<string, unknown> {
	return {
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
	};
}

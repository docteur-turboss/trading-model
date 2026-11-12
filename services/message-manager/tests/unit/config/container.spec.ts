import { describe, expect, it, jest } from "@jest/globals";
import type { FilePath } from "@trading-model/primitives/primitives";

jest.mock("express-rate-limit", () => {
	return jest.fn(
		() => (_req: unknown, _res: unknown, next: () => void) => next()
	);
});

import createBrokerModule, {
	publishJournalLag,
} from "../../../src/config/container";
import {
	JOURNAL_OLDEST_PENDING_AGE_SECONDS,
	JOURNAL_PENDING_ENTRIES,
} from "../../../src/config/metrics";
import type {
	JournalGroupLag,
	MessageJournalPort,
} from "../../../src/domain/ports/message-journal.port";

jest.mock("../../../src/config/address-manager", () => ({
	ADDRESS_MANAGER_ROUTES: jest.fn<(...args: any[]) => any>(),
	BOOTSTRAP_ADDRESS_MANAGER: jest.fn<(...args: any[]) => any>(),
}));

jest.mock("@trading-model/http/adapters/outbound/http-client", () => {
	const mockInstance = {
		post: jest.fn<(...args: any[]) => any>(),
		get: jest.fn<(...args: any[]) => any>(),
	};
	const MockHttpClient = Object.assign(
		jest.fn<(...args: any[]) => any>().mockImplementation(() => mockInstance),
		{ createWithTls: jest.fn((..._args: any[]) => mockInstance) }
	);
	return { HttpClient: MockHttpClient };
});

describe("createBrokerModule", () => {
	it("should create without error", () => {
		const module = createBrokerModule({
			caPath: "/certs/ca.pem" as FilePath,
			certPath: "/certs/cert.pem" as FilePath,
			keyPath: "/certs/key.pem" as FilePath,
		});

		expect(module).toBeDefined();
	});

	it("should expose a listen method", () => {
		const module = createBrokerModule({
			caPath: "/certs/ca.pem" as FilePath,
			certPath: "/certs/cert.pem" as FilePath,
			keyPath: "/certs/key.pem" as FilePath,
		});

		expect(module.listen).toBeDefined();
		expect(typeof module.listen).toBe("function");
	});

	it("should refuse a dlq-service secret shorter than 16 characters", () => {
		expect(() =>
			createBrokerModule(
				{
					caPath: "/certs/ca.pem" as FilePath,
					certPath: "/certs/cert.pem" as FilePath,
					keyPath: "/certs/key.pem" as FilePath,
				},
				{ dlqSecret: "short" }
			)
		).toThrow("at least 16 characters");
	});

	it("should accept an Express app in listen method", () => {
		const module = createBrokerModule({
			caPath: "/certs/ca.pem" as FilePath,
			certPath: "/certs/cert.pem" as FilePath,
			keyPath: "/certs/key.pem" as FilePath,
		});

		const mockApp = { use: jest.fn<(...args: any[]) => any>() };
		module.listen(mockApp as never);

		expect(mockApp.use).toHaveBeenCalled();
		expect(mockApp.use).toHaveBeenCalledTimes(1);
	});
});

describe("publishJournalLag", () => {
	it("should set both gauges per group and drop a group that left", async () => {
		const lag = jest
			.fn<() => Promise<JournalGroupLag[]>>()
			.mockResolvedValueOnce([
				{
					topic: "t" as never,
					service: "a",
					pending: 4,
					oldestPendingAgeMs: 90_000,
				},
				{
					topic: "t" as never,
					service: "b",
					pending: 1,
					oldestPendingAgeMs: 0,
				},
			])
			.mockResolvedValueOnce([
				{
					topic: "t" as never,
					service: "a",
					pending: 0,
					oldestPendingAgeMs: 0,
				},
			]);
		const journal = { lag } as unknown as MessageJournalPort;

		await publishJournalLag(journal);
		const first = await JOURNAL_OLDEST_PENDING_AGE_SECONDS.get();
		await publishJournalLag(journal);

		expect(first.values.find((v) => v.labels.service === "a")?.value).toBe(90);
		const pending = (await JOURNAL_PENDING_ENTRIES.get()).values;
		expect(pending).toHaveLength(1);
		expect(pending[0]?.labels).toEqual({ topic: "t", service: "a" });
	});

	it("should clear the gauges when the read fails", async () => {
		JOURNAL_PENDING_ENTRIES.set({ topic: "t", service: "a" }, 3);
		JOURNAL_OLDEST_PENDING_AGE_SECONDS.set({ topic: "t", service: "a" }, 9);
		const journal = {
			lag: jest
				.fn<(...args: any[]) => any>()
				.mockRejectedValue(new Error("down")),
		} as unknown as MessageJournalPort;

		await expect(publishJournalLag(journal)).rejects.toThrow("down");

		expect((await JOURNAL_PENDING_ENTRIES.get()).values).toHaveLength(0);
		expect(
			(await JOURNAL_OLDEST_PENDING_AGE_SECONDS.get()).values
		).toHaveLength(0);
	});

	it("should do nothing for a journal that cannot tell", async () => {
		await expect(
			publishJournalLag({} as MessageJournalPort)
		).resolves.toBeUndefined();
	});
});

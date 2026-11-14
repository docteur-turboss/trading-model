import { describe, expect, it, jest } from "@jest/globals";
import { HttpMethod } from "@trading-model/contracts/signed-request";
import { verifySignature } from "@trading-model/crypto/application/services/request-signer";
import { createHttpClientError } from "@trading-model/http/adapters/outbound/http-client-errors";
import { ServiceId } from "@trading-model/primitives/primitives";
import {
	HttpDeadLetterStore,
	isPermanentRejection,
} from "../../../../src/adapters/outbound/http-dead-letter-store";
import { DLQ_REJECTED_TOTAL } from "../../../../src/config/metrics";

const SECRET = "0123456789abcdef-secret";
const URL = "https://10.0.0.7:3000/dlq";

function createStore() {
	const post = jest.fn<(...args: unknown[]) => Promise<void>>(
		async () => undefined
	);
	const store = new HttpDeadLetterStore({
		httpClient: { post } as never,
		resolveUrl: async () => URL as never,
		secret: SECRET,
	});
	return { store, post };
}

const ENTRY = {
	topic: "market.candles.fetch",
	message: {
		payload: { close: 1 },
		metadata: { topic: "market.candles.fetch" },
	},
	reason: "MAX_RETRIES_EXCEEDED",
	deliveryAttempt: 10,
	timestamp: 1_767_225_600_000,
	unset: undefined,
} as never;

describe("HttpDeadLetterStore", () => {
	it("should POST the entry to dlq-service with a signature it verifies", async () => {
		const { store, post } = createStore();

		await store.insert(ENTRY);

		const [url, body, options] = post.mock.calls[0] as [
			string,
			Record<string, unknown>,
			{ headers: Record<string, string> },
		];
		expect(url).toBe(URL);
		// What dlq-service parses: JSON drops undefined fields.
		expect(body).not.toHaveProperty("unset");
		expect(options.headers["x-service-name"]).toBe("message-manager");
		expect(
			verifySignature(
				{
					serviceName: ServiceId.of("message-manager"),
					method: HttpMethod.Post,
					path: "/dlq",
					body,
				},
				{
					signature: options.headers["x-signature"] as never,
					timestamp: options.headers["x-timestamp"] as never,
					secret: SECRET,
				}
			)
		).toBe(true);
	});

	// A POST that timed out may have been stored: re-sending it would store
	// it twice. HttpClient re-sends a POST only when it never left, unless marked.
	it("should not mark the insert idempotent", async () => {
		const { store, post } = createStore();

		await store.insert(ENTRY);

		expect(post.mock.calls[0]?.[2]).toMatchObject({ timeoutMs: 5000 });
		expect(post.mock.calls[0]?.[2]).not.toHaveProperty("idempotent");
	});

	it("should propagate a failure, for the caller to keep the entry", async () => {
		const { store, post } = createStore();
		post.mockRejectedValueOnce(new Error("connect ECONNREFUSED"));

		await expect(store.insert(ENTRY)).rejects.toThrow("ECONNREFUSED");
	});

	it("should count a permanent rejection and still throw it", async () => {
		const { store, post } = createStore();
		post.mockRejectedValueOnce(createHttpClientError("x", 400 as never));
		const before = (await DLQ_REJECTED_TOTAL.get()).values[0]?.value ?? 0;

		await expect(store.insert(ENTRY)).rejects.toThrow("x");

		const after = await DLQ_REJECTED_TOTAL.get();
		expect(after.values[0].value - before).toBe(1);
	});

	it("should refuse a secret dlq-service would never accept", () => {
		expect(
			() =>
				new HttpDeadLetterStore({
					httpClient: {} as never,
					resolveUrl: async () => URL as never,
					secret: "short",
				})
		).toThrow("at least 16 characters");
	});
});

describe("isPermanentRejection", () => {
	it.each([
		[400, true],
		[413, true],
		[401, false],
		[403, false],
		[429, false],
		[503, false],
	])("HTTP %i → %s", (status, expected) => {
		expect(
			isPermanentRejection(createHttpClientError("x", status as never))
		).toBe(expected);
	});

	it("should not treat a network error as permanent", () => {
		expect(isPermanentRejection(new Error("ETIMEDOUT"))).toBe(false);
	});
});

import { appendFile } from "node:fs/promises";
import { describe, expect, it, jest } from "@jest/globals";
import { isDeadLetterError } from "@trading-model/common/utils/errors";
import type { HttpStatusCode } from "@trading-model/contracts/http-status";
import {
	createHttpClientError,
	createHttpClientTimeoutError,
} from "@trading-model/http/adapters/outbound/http-client";
import { HttpMessageDelivery } from "../../../../src/adapters/outbound/http-message-delivery";
import { DELIVERY_ATTEMPT_TIMEOUT_MS } from "../../../../src/domain/backoff-calculator";
import { FileDlqRepository } from "../../../../src/infrastructure/fallback/dlq-repository";
import { createMockMessage } from "../../../fixtures/broker.fixture";
import { createMockHttpClient } from "../../../helpers/broker.helper";

jest.mock("node:fs/promises");

describe("HttpMessageDelivery", () => {
	let mockHttpClient: ReturnType<typeof createMockHttpClient>;
	let dqlRepository: FileDlqRepository;
	let delivery: HttpMessageDelivery;

	beforeEach(() => {
		mockHttpClient = createMockHttpClient();
		dqlRepository = new FileDlqRepository("/tmp/test-dlq.jsonl");
		delivery = new HttpMessageDelivery(mockHttpClient as never, dqlRepository);
	});

	describe("send", () => {
		it("should POST metadata and payload at the top level, as subscribers read them", async () => {
			const message = createMockMessage({ key: "value" });
			const context = { deliveryAttempt: 1 };

			await delivery.send({
				url: "http://example.com/callback",
				message,
				context,
			});

			expect(mockHttpClient.post).toHaveBeenCalledWith(
				"http://example.com/callback",
				{
					metadata: message.metadata,
					payload: message.payload,
					context,
				},
				// One attempt: the dispatcher owns the retries.
				{ timeoutMs: DELIVERY_ATTEMPT_TIMEOUT_MS, retryCount: 0 }
			);
		});

		function sendFailingWith(error: unknown): Promise<unknown> {
			mockHttpClient.post.mockRejectedValue(error as never);
			return delivery
				.send({
					url: "http://example.com/callback",
					message: createMockMessage({ key: "value" }),
					context: { deliveryAttempt: 1 },
				})
				.then(
					() => undefined,
					(err: unknown) => err
				);
		}

		it.each([400, 413, 415, 422])(
			"should turn a %i answer into a dead letter, as no retry can succeed",
			async (status) => {
				const err = await sendFailingWith(
					createHttpClientError("rejected", status as HttpStatusCode)
				);

				expect(isDeadLetterError(err)).toBe(true);
				expect((err as { reason?: string }).reason).toBe(
					"REJECTED_BY_SUBSCRIBER"
				);
			}
		);

		it.each([401, 403, 404, 408, 429, 500, 503])(
			"should keep a %i answer retryable",
			async (status) => {
				const original = createHttpClientError(
					"failed",
					status as HttpStatusCode
				);

				expect(await sendFailingWith(original)).toBe(original);
			}
		);

		it("should keep a timeout retryable", async () => {
			const timeout = createHttpClientTimeoutError("timed out", 10_000);

			expect(await sendFailingWith(timeout)).toBe(timeout);
		});
	});

	describe("markDeadLetter", () => {
		it("should add the message to the DLQ repository", async () => {
			const message = createMockMessage({ key: "value" });

			await delivery.markDeadLetter({
				message,
				reason: "REASON",
				deliveryAttempt: 3,
			});

			expect(appendFile).toHaveBeenCalledWith(
				"/tmp/test-dlq.jsonl",
				expect.stringContaining("REASON"),
				"utf-8"
			);
			const written = JSON.parse(
				(appendFile as unknown as jest.Mock).mock.calls[0][1]
			);
			expect(written.topic).toBe(message.metadata.topic);
			expect(written.reason).toBe("REASON");
			expect(written.deliveryAttempt).toBe(3);
			expect(written.message).toEqual(JSON.parse(JSON.stringify(message)));
			expect(written.timestamp).toBeDefined();
		});
	});
});

import { appendFile } from "node:fs/promises";
import { describe, expect, it, jest } from "@jest/globals";
import { FileDlqRepository } from "../../../../src/messaging/core/dlq-repository";
import { HttpMessageDelivery } from "../../../../src/messaging/core/http-message-delivery";
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
		it("should POST the message to the given URL", async () => {
			const message = createMockMessage({ key: "value" });
			const context = { deliveryAttempt: 1, consumerGroup: "test-group" };

			await delivery.send({
				url: "http://example.com/callback",
				message,
				context,
			});

			expect(mockHttpClient.post).toHaveBeenCalledWith(
				"http://example.com/callback",
				{
					message,
					context,
				}
			);
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
			expect(written.reason).toBe("REASON");
			expect(written.deliveryAttempt).toBe(3);
			expect(written.message).toEqual(JSON.parse(JSON.stringify(message)));
			expect(written.timestamp).toBeDefined();
		});
	});
});

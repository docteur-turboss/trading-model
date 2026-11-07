import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import { ServiceInstanceName } from "@trading-model/common/config/services.types";
import { PUBLISH_COMPAT_TIMEOUT_MS } from "@trading-model/contracts/publish-timeout";
import { logger } from "@trading-model/http/infrastructure/logger";
import { MessageManagerClient } from "../../src/adapters/outbound/message-manager-client";

describe("MessageManagerClient", () => {
	let client: MessageManagerClient;
	let httpClient: any;
	let addressManagerClient: any;

	const mockConfig = {
		serviceName: "TestService",
		callbackPath: "/message",
		instanceId: "550e8400-e29b-41d4-a716-446655440000",
	};

	const mockServiceInstance = {
		host: "192.168.1.100",
		port: 3001,
		instanceId: "mm-1",
	};

	beforeEach(() => {
		httpClient = {
			post: jest.fn(),
			delete: jest.fn(),
		};
		addressManagerClient = {
			findService: jest.fn(),
			recordCallSuccess: jest.fn(),
			recordCallFailure: jest.fn(),
		};
		client = new MessageManagerClient(
			httpClient,
			mockConfig as any,
			addressManagerClient as any
		);
	});

	describe("subscribe", () => {
		it("should subscribe to a single topic successfully", async () => {
			addressManagerClient.findService.mockResolvedValue(mockServiceInstance);
			httpClient.post.mockResolvedValue(undefined);

			await client.subscribe(["example.debug.create"]);

			expect(addressManagerClient.findService).toHaveBeenCalled();
			expect(httpClient.post).toHaveBeenCalledWith(
				"https://192.168.1.100:3001/subscribe",
				expect.objectContaining({
					topic: "example.debug.create",
					callbackPath: mockConfig.callbackPath,
				}),
				{ idempotent: true }
			);
		});

		it("should subscribe to multiple topics", async () => {
			addressManagerClient.findService.mockResolvedValue(mockServiceInstance);
			httpClient.post.mockResolvedValue(undefined);

			await client.subscribe(["example.debug.create", "example.show.create"]);

			expect(httpClient.post).toHaveBeenCalledTimes(2);
		});

		it("should throw ServiceUnreachableError when service not found", async () => {
			addressManagerClient.findService.mockResolvedValue(null);

			await expect(client.subscribe(["example.debug.create"])).rejects.toThrow(
				Error
			);
		});

		it("should propagate MessageManagerError on subscription failure", async () => {
			addressManagerClient.findService.mockResolvedValue(mockServiceInstance);
			httpClient.post.mockRejectedValue(new Error("Network error"));

			await expect(client.subscribe(["example.debug.create"])).rejects.toThrow(
				"Failed to subscribe topic to Message Manager"
			);
		});

		it("should throw MessageManagerError on generic error in subscribe", async () => {
			addressManagerClient.findService.mockRejectedValue(
				new Error("Generic error")
			);

			await expect(client.subscribe(["example.debug.create"])).rejects.toThrow(
				Error
			);
		});
	});

	describe("unsubscribe", () => {
		it("should unsubscribe from topics", async () => {
			addressManagerClient.findService.mockResolvedValue(mockServiceInstance);
			httpClient.delete.mockResolvedValue(undefined);

			await client.unsubscribe(["example.debug.create"]);

			expect(httpClient.delete).toHaveBeenCalled();
		});

		it.each([
			[
				"the service is not found",
				() => addressManagerClient.findService.mockResolvedValue(null),
			],
			[
				"the request fails",
				() => {
					addressManagerClient.findService.mockResolvedValue(
						mockServiceInstance
					);
					httpClient.delete.mockRejectedValue(new Error("Network error"));
				},
			],
			[
				"the lookup throws",
				() =>
					addressManagerClient.findService.mockRejectedValue(
						new Error("Generic error")
					),
			],
		])(
			"should log and resolve when %s (best-effort shutdown)",
			async (_case, arrange) => {
				arrange();
				const warn = jest
					.spyOn(logger, "warn")
					.mockImplementation(() => undefined);

				await expect(
					client.unsubscribe(["example.debug.create"])
				).resolves.toBeUndefined();
				expect(warn).toHaveBeenCalledWith(
					"Failed to unsubscribe topics from Message Manager",
					expect.anything()
				);
				warn.mockRestore();
			}
		);
	});

	describe("publish", () => {
		it("should publish an async message", async () => {
			addressManagerClient.findService.mockResolvedValue(mockServiceInstance);
			httpClient.post.mockResolvedValue(undefined);

			const metadata = {
				eventType: "test",
				topic: "test.event",
				schemaVersion: "1.0.0",
				publisher: { serviceName: "TestService", instanceId: "uuid" },
			} as any;
			await client.publish({ hello: "world" }, metadata);

			expect(httpClient.post).toHaveBeenCalledWith(
				"https://192.168.1.100:3001/message",
				{
					payload: { hello: "world" },
					metadata,
				},
				// Outlasts the broker's own timeout; never re-sent once it left.
				{ timeoutMs: PUBLISH_COMPAT_TIMEOUT_MS, retryUnsentOnly: true }
			);
		});

		it("reports the outcome of a publish to the target's circuit breaker", async () => {
			addressManagerClient.findService.mockResolvedValue(mockServiceInstance);
			httpClient.post.mockResolvedValueOnce(undefined);
			await client.publish({}, {} as any);
			expect(addressManagerClient.recordCallSuccess).toHaveBeenCalledWith(
				"mm-1",
				expect.any(Number)
			);

			httpClient.post.mockRejectedValueOnce(new Error("down"));
			await expect(client.publish({}, {} as any)).rejects.toThrow(Error);
			expect(addressManagerClient.recordCallFailure).toHaveBeenCalledWith(
				"mm-1",
				expect.any(Number)
			);
		});

		it("counts a business 4xx as a live target, not a breaker failure", async () => {
			addressManagerClient.findService.mockResolvedValue(mockServiceInstance);
			httpClient.post.mockRejectedValueOnce(
				Object.assign(new Error("bad request"), { statusCode: 400 })
			);
			await expect(client.publish({}, {} as any)).rejects.toThrow(Error);
			expect(addressManagerClient.recordCallSuccess).toHaveBeenCalledTimes(1);
			expect(addressManagerClient.recordCallFailure).not.toHaveBeenCalled();
		});

		it("should rethrow ServiceUnreachableError when service not found", async () => {
			addressManagerClient.findService.mockResolvedValue(null);

			await expect(client.publish({}, {} as any)).rejects.toThrow(Error);
		});

		it("should throw MessageManagerError on publish failure", async () => {
			addressManagerClient.findService.mockResolvedValue(mockServiceInstance);
			httpClient.post.mockRejectedValue(new Error("Publish failed"));

			await expect(client.publish({}, {} as any)).rejects.toThrow(Error);
		});
	});

	describe("publishDirectMessage", () => {
		it("should publish a direct message", async () => {
			addressManagerClient.findService.mockResolvedValue(mockServiceInstance);
			httpClient.post.mockResolvedValue(undefined);

			const metadata = {
				eventType: "test",
				topic: "test.event",
				schemaVersion: "1.0.0",
				publisher: { serviceName: "TestService", instanceId: "uuid" },
			} as any;
			await client.publishDirectMessage(
				ServiceInstanceName.MessageManagerService,
				{ data: "test" },
				metadata
			);

			expect(httpClient.post).toHaveBeenCalled();
		});

		it("should rethrow ServiceUnreachableError when direct service not found", async () => {
			addressManagerClient.findService.mockResolvedValue(null);

			await expect(
				client.publishDirectMessage(
					ServiceInstanceName.MessageManagerService,
					{},
					{} as any
				)
			).rejects.toThrow(Error);
		});

		it("should throw MessageManagerError on direct publish failure", async () => {
			addressManagerClient.findService.mockResolvedValue(mockServiceInstance);
			httpClient.post.mockRejectedValue(new Error("Publish failed"));

			await expect(
				client.publishDirectMessage(
					ServiceInstanceName.MessageManagerService,
					{},
					{} as any
				)
			).rejects.toThrow(Error);
		});
	});
});

import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import { ServiceInstanceName } from "@trading-model/common/config/services.types";
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
	};

	beforeEach(() => {
		httpClient = {
			post: jest.fn(),
			delete: jest.fn(),
		};
		addressManagerClient = {
			findService: jest.fn(),
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
				})
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

		it("should swallow MessageManagerError on subscription failure", async () => {
			addressManagerClient.findService.mockResolvedValue(mockServiceInstance);
			httpClient.post.mockRejectedValue(new Error("Network error"));

			const result = await client.subscribe(["example.debug.create"]);
			expect(result).toBeUndefined();
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

		it("should rethrow ServiceUnreachableError when service not found", async () => {
			addressManagerClient.findService.mockResolvedValue(null);

			await expect(
				client.unsubscribe(["example.debug.create"])
			).rejects.toThrow(Error);
		});

		it("should swallow MessageManagerError on unsubscribe failure", async () => {
			addressManagerClient.findService.mockResolvedValue(mockServiceInstance);
			httpClient.delete.mockRejectedValue(new Error("Network error"));

			const result = await client.unsubscribe(["example.debug.create"]);
			expect(result).toBeUndefined();
		});

		it("should throw MessageManagerError on generic error in unsubscribe", async () => {
			addressManagerClient.findService.mockRejectedValue(
				new Error("Generic error")
			);

			await expect(
				client.unsubscribe(["example.debug.create"])
			).rejects.toThrow(Error);
		});
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
				}
			);
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
				ServiceInstanceName.MessageDeliveryService,
				{ data: "test" },
				metadata
			);

			expect(httpClient.post).toHaveBeenCalled();
		});

		it("should rethrow ServiceUnreachableError when direct service not found", async () => {
			addressManagerClient.findService.mockResolvedValue(null);

			await expect(
				client.publishDirectMessage(
					ServiceInstanceName.MessageDeliveryService,
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
					ServiceInstanceName.MessageDeliveryService,
					{},
					{} as any
				)
			).rejects.toThrow(Error);
		});
	});
});
